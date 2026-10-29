import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, and, isNull } from 'drizzle-orm';
import { contractorCreateSchema, contractorUpdateSchema, idParamSchema } from '@reno/shared';
import { contractors, quotes } from '../db/schema.ts';
import { found } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export const contractorRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/contractors', async () =>
      db.select().from(contractors).orderBy(asc(contractors.name)).all(),
    );

    app.get('/contractors/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      return found(
        db.select().from(contractors).where(eq(contractors.id, id)).get(),
        'Hantverkaren',
      );
    });

    app.post('/contractors', async (req, reply) => {
      const data = parse(contractorCreateSchema, req.body);
      reply.status(201);
      return db.insert(contractors).values(data).returning().get();
    });

    app.patch('/contractors/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(contractorUpdateSchema, req.body);
      return found(
        db
          .update(contractors)
          .set({ ...data, updatedAt: nowIso() })
          .where(eq(contractors.id, id))
          .returning()
          .get(),
        'Hantverkaren',
      );
    });

    app.delete('/contractors/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const contractor = found(
        db.select().from(contractors).where(eq(contractors.id, id)).get(),
        'Hantverkaren',
      );
      // Offerterna ska fortfarande visa vem de kom från när hantverkaren tas bort.
      db.transaction((tx) => {
        tx.update(quotes)
          .set({ supplierName: contractor.name })
          .where(and(eq(quotes.contractorId, id), isNull(quotes.supplierName)))
          .run();
        tx.delete(contractors).where(eq(contractors.id, id)).run();
      });
      reply.status(204);
    });
  };
