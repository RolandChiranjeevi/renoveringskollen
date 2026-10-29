import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  formatSek,
  idParamSchema,
  projectCreateSchema,
  projectListQuerySchema,
  projectUpdateSchema,
} from '@reno/shared';
import type { Db } from '../db/client.ts';
import {
  attachments,
  quotes,
  contractors,
  expenses,
  projectBudgets,
  projectRooms,
  projects,
  tasks,
} from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import { performedByProjects } from '../queries/performedBy.ts';
import type { RouteDeps } from './types.ts';

type Project = typeof projects.$inferSelect;

/** Lägger till rum, spenderat belopp och uppgiftsräkning på en lista projekt. */
export function summarize(db: Db, list: Project[]) {
  if (list.length === 0) return [];
  const ids = list.map((p) => p.id);
  const roomLinks = db
    .select()
    .from(projectRooms)
    .where(inArray(projectRooms.projectId, ids))
    .all();
  const spent = db
    .select({ projectId: expenses.projectId, total: sql<number>`sum(${expenses.amountOre})` })
    .from(expenses)
    .where(inArray(expenses.projectId, ids))
    .groupBy(expenses.projectId)
    .all();
  const taskCounts = db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)`,
      done: sql<number>`sum(${tasks.done})`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, ids))
    .groupBy(tasks.projectId)
    .all();

  return list.map((p) => {
    const t = taskCounts.find((c) => c.projectId === p.id);
    return {
      ...p,
      roomIds: roomLinks.filter((l) => l.projectId === p.id).map((l) => l.roomId),
      spentOre: spent.find((s) => s.projectId === p.id)?.total ?? 0,
      taskCount: t?.total ?? 0,
      tasksDone: t?.done ?? 0,
    };
  });
}

export const projectRoutes =
  ({ db, files }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const getProject = (id: number) =>
      found(db.select().from(projects).where(eq(projects.id, id)).get(), 'Projektet');

    const detail = (id: number) => {
      const [project] = summarize(db, [getProject(id)]);
      const contractor = project!.contractorId
        ? (db.select().from(contractors).where(eq(contractors.id, project!.contractorId)).get() ??
          null)
        : null;
      return { ...project!, contractor, performedBy: performedByProjects(db, [id]).get(id) ?? [] };
    };

    app.get('/projects', async (req) => {
      const { status, roomId } = parse(projectListQuerySchema, req.query);
      const filters: SQL[] = [];
      if (status) filters.push(eq(projects.status, status));
      if (roomId) {
        filters.push(
          inArray(
            projects.id,
            db
              .select({ id: projectRooms.projectId })
              .from(projectRooms)
              .where(eq(projectRooms.roomId, roomId)),
          ),
        );
      }
      const list = db
        .select()
        .from(projects)
        .where(and(...filters))
        .orderBy(desc(projects.startDate), desc(projects.id))
        .all();
      return summarize(db, list);
    });

    app.get('/projects/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      return detail(id);
    });

    app.post('/projects', async (req, reply) => {
      const { roomIds, ...data } = parse(projectCreateSchema, req.body);
      const id = db.transaction((tx) => {
        const created = tx.insert(projects).values(data).returning({ id: projects.id }).get();
        if (roomIds?.length) {
          tx.insert(projectRooms)
            .values([...new Set(roomIds)].map((roomId) => ({ projectId: created.id, roomId })))
            .run();
        }
        return created.id;
      });
      reply.status(201);
      return detail(id);
    });

    app.patch('/projects/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const { roomIds, ...data } = parse(projectUpdateSchema, req.body);
      const current = getProject(id);
      const startDate = data.startDate !== undefined ? data.startDate : current.startDate;
      const endDate = data.endDate !== undefined ? data.endDate : current.endDate;
      if (startDate && endDate && endDate < startDate) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'endDate', message: 'Slutdatum måste vara efter startdatum' },
        ]);
      }
      // Kategoribudgetarna är en uppdelning av totalbudgeten – den får inte sättas lägre än summan.
      if (data.budgetOre !== undefined) {
        const allocated =
          db
            .select({ total: sql<number>`coalesce(sum(${projectBudgets.budgetOre}), 0)` })
            .from(projectBudgets)
            .where(eq(projectBudgets.projectId, id))
            .get()?.total ?? 0;
        if (data.budgetOre < allocated) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
            {
              path: 'budgetOre',
              message: `Budgeten kan inte vara lägre än det som fördelats på kategorier (${formatSek(allocated)}). Sänk kategoribudgetarna först.`,
            },
          ]);
        }
      }
      db.transaction((tx) => {
        tx.update(projects)
          .set({ ...data, updatedAt: nowIso() })
          .where(eq(projects.id, id))
          .run();
        if (roomIds) {
          tx.delete(projectRooms).where(eq(projectRooms.projectId, id)).run();
          if (roomIds.length) {
            tx.insert(projectRooms)
              .values([...new Set(roomIds)].map((roomId) => ({ projectId: id, roomId })))
              .run();
          }
        }
      });
      return detail(id);
    });

    app.delete('/projects/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      getProject(id);
      // Bilagor på projektet, dess utgifter och offerter raderas via cascade; filerna tas bort efteråt.
      const stored = db
        .select({ name: attachments.storedName })
        .from(attachments)
        .where(
          or(
            eq(attachments.projectId, id),
            inArray(
              attachments.expenseId,
              db.select({ id: expenses.id }).from(expenses).where(eq(expenses.projectId, id)),
            ),
            inArray(
              attachments.quoteId,
              db.select({ id: quotes.id }).from(quotes).where(eq(quotes.projectId, id)),
            ),
          ),
        )
        .all()
        .map((a) => a.name);
      db.delete(projects).where(eq(projects.id, id)).run();
      await files.remove(stored);
      reply.status(204);
    });
  };
