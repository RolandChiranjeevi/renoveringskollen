import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';
import { idParamSchema, materialCreateSchema, materialUpdateSchema } from '@reno/shared';
import type { Db } from '../db/client.ts';
import { materials, rooms } from '../db/schema.ts';
import { found } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

// Ordning för ytor i listor och rapporter: golv först, övrigt sist.
const SURFACE_ORDER = sql`case ${materials.surface} when 'golv' then 0 when 'vagg' then 1 when 'tak' then 2 when 'snickerier' then 3 else 4 end`;

export const listRoomMaterials = (db: Db, roomId?: number) =>
  db
    .select()
    .from(materials)
    .where(roomId === undefined ? undefined : eq(materials.roomId, roomId))
    .orderBy(SURFACE_ORDER, asc(materials.id))
    .all();

export const materialRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const requireRoom = (id: number) =>
      found(db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id)).get(), 'Rummet');

    app.get('/rooms/:id/materials', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      requireRoom(id);
      return listRoomMaterials(db, id);
    });

    app.post('/rooms/:id/materials', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(materialCreateSchema, req.body);
      requireRoom(id);
      reply.status(201);
      return db
        .insert(materials)
        .values({ ...data, roomId: id })
        .returning()
        .get();
    });

    app.patch('/materials/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(materialUpdateSchema, req.body);
      return found(
        db
          .update(materials)
          .set({ ...data, updatedAt: nowIso() })
          .where(eq(materials.id, id))
          .returning()
          .get(),
        'Materialet',
      );
    });

    app.delete('/materials/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(db.delete(materials).where(eq(materials.id, id)).returning().get(), 'Materialet');
      reply.status(204);
    });
  };
