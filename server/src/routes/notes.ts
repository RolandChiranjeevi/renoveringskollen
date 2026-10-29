import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import {
  idParamSchema,
  noteCreateSchema,
  noteListQuerySchema,
  noteUpdateSchema,
} from '@reno/shared';
import { notes } from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { authorLookup } from '../queries/authors.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export const noteRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/notes', async (req) => {
      const { projectId, roomId } = parse(noteListQuerySchema, req.query);
      if (!projectId && !roomId) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ange projectId eller roomId');
      }
      const filters: SQL[] = [];
      if (projectId) filters.push(eq(notes.projectId, projectId));
      if (roomId) filters.push(eq(notes.roomId, roomId));
      return db
        .select()
        .from(notes)
        .where(and(...filters))
        .orderBy(desc(notes.createdAt), desc(notes.id))
        .all()
        .map(authorLookup(db));
    });

    app.post('/notes', async (req, reply) => {
      const data = parse(noteCreateSchema, req.body);
      reply.status(201);
      return authorLookup(db)(
        db
          .insert(notes)
          .values({ ...data, createdBy: req.user.id })
          .returning()
          .get(),
      );
    });

    app.patch('/notes/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(noteUpdateSchema, req.body);
      return authorLookup(db)(
        found(
          db
            .update(notes)
            .set({ ...data, updatedAt: nowIso() })
            .where(eq(notes.id, id))
            .returning()
            .get(),
          'Anteckningen',
        ),
      );
    });

    app.delete('/notes/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(db.delete(notes).where(eq(notes.id, id)).returning().get(), 'Anteckningen');
      reply.status(204);
    });
  };
