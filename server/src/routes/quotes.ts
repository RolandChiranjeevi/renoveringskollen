import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import {
  formatSek,
  idParamSchema,
  quoteCreateSchema,
  quoteUpdateSchema,
  type Quote,
} from '@reno/shared';
import type { Db } from '../db/client.ts';
import { attachments, contractors, projectBudgets, projects, quotes } from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

const UNKNOWN_SUPPLIER = 'Okänd hantverkare';

/** Offerter med det visade namnet utrett: sparad hantverkare först, annars det inskrivna namnet. */
function selectQuotes(db: Db, where: SQL | undefined): Quote[] {
  return db
    .select({ quote: quotes, contractorName: contractors.name })
    .from(quotes)
    .leftJoin(contractors, eq(contractors.id, quotes.contractorId))
    .where(where)
    .orderBy(asc(quotes.amountOre), asc(quotes.id))
    .all()
    .map(({ quote, contractorName }) => ({
      ...quote,
      supplier: contractorName ?? quote.supplierName ?? UNKNOWN_SUPPLIER,
    }));
}

export const listQuotes = (db: Db, projectId: number) =>
  selectQuotes(db, eq(quotes.projectId, projectId));

export const quoteRoutes =
  ({ db, files }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const requireProject = (id: number) =>
      found(db.select().from(projects).where(eq(projects.id, id)).get(), 'Projektet');
    const getQuote = (id: number) => {
      const [quote] = selectQuotes(db, eq(quotes.id, id));
      return found(quote, 'Offerten');
    };
    const assertContractor = (contractorId: number | null | undefined) => {
      if (contractorId == null) return;
      const exists = db
        .select({ id: contractors.id })
        .from(contractors)
        .where(eq(contractors.id, contractorId))
        .get();
      if (!exists) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'contractorId', message: 'Hantverkaren finns inte' },
        ]);
      }
    };

    app.get('/projects/:id/quotes', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      requireProject(id);
      return listQuotes(db, id);
    });

    app.post('/projects/:id/quotes', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(quoteCreateSchema, req.body);
      requireProject(id);
      assertContractor(data.contractorId);
      const created = db
        .insert(quotes)
        .values({ ...data, projectId: id })
        .returning()
        .get();
      reply.status(201);
      return getQuote(created.id);
    });

    app.patch('/quotes/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(quoteUpdateSchema, req.body);
      const current = getQuote(id);
      assertContractor(data.contractorId);
      // Offerten måste fortfarande ha en avsändare efter ändringen.
      const contractorId =
        data.contractorId !== undefined ? data.contractorId : current.contractorId;
      const supplierName =
        data.supplierName !== undefined ? data.supplierName : current.supplierName;
      if (contractorId == null && !supplierName) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'supplierName', message: 'Ange vem offerten kommer från' },
        ]);
      }
      db.update(quotes)
        .set({ ...data, updatedAt: nowIso() })
        .where(eq(quotes.id, id))
        .run();
      return getQuote(id);
    });

    app.delete('/quotes/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      // Dokumenten på offerten raderas via cascade; filerna tas bort efteråt.
      const stored = db
        .select({ name: attachments.storedName })
        .from(attachments)
        .where(eq(attachments.quoteId, id))
        .all()
        .map((a) => a.name);
      found(db.delete(quotes).where(eq(quotes.id, id)).returning().get(), 'Offerten');
      await files.remove(stored);
      reply.status(204);
    });

    // Väljer offerten: den blir projektets hantverkare och budget. En tidigare vald offert i samma
    // projekt blir ovald. Saknas sparad hantverkare skapas (eller återanvänds) en med samma namn.
    app.post('/quotes/:id/choose', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const quote = getQuote(id);
      // Kategoribudgetarna är en uppdelning av totalbudgeten – den får inte bli lägre än summan.
      const allocated =
        db
          .select({ total: sql<number>`coalesce(sum(${projectBudgets.budgetOre}), 0)` })
          .from(projectBudgets)
          .where(eq(projectBudgets.projectId, quote.projectId))
          .get()?.total ?? 0;
      if (quote.amountOre < allocated) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          {
            path: 'amountOre',
            message: `Offerten (${formatSek(quote.amountOre)}) är lägre än det som fördelats på kategorier (${formatSek(allocated)}). Sänk kategoribudgetarna först.`,
          },
        ]);
      }

      db.transaction((tx) => {
        let contractorId = quote.contractorId;
        if (contractorId == null) {
          const name = quote.supplierName ?? UNKNOWN_SUPPLIER;
          const existing = tx
            .select({ id: contractors.id })
            .from(contractors)
            .where(sql`sv_lower(${contractors.name}) = ${name.toLocaleLowerCase('sv-SE')}`)
            .get();
          contractorId =
            existing?.id ?? tx.insert(contractors).values({ name }).returning().get().id;
        }
        const now = nowIso();
        tx.update(quotes)
          .set({ chosen: false, updatedAt: now })
          .where(and(eq(quotes.projectId, quote.projectId), eq(quotes.chosen, true)))
          .run();
        tx.update(quotes)
          .set({ chosen: true, contractorId, updatedAt: now })
          .where(eq(quotes.id, id))
          .run();
        tx.update(projects)
          .set({ contractorId, budgetOre: quote.amountOre, updatedAt: now })
          .where(eq(projects.id, quote.projectId))
          .run();
      });
      return getQuote(id);
    });

    // Tar bort markeringen "vald". Projektets hantverkare och budget lämnas som de är.
    app.post('/quotes/:id/unchoose', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      getQuote(id);
      db.update(quotes).set({ chosen: false, updatedAt: nowIso() }).where(eq(quotes.id, id)).run();
      return getQuote(id);
    });
  };
