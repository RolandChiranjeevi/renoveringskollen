import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';
import {
  idParamSchema,
  measurementCreateSchema,
  measurementUpdateSchema,
  roomCreateSchema,
  roomUpdateSchema,
} from '@reno/shared';
import { attachments, expenses, measurements, projectRooms, rooms } from '../db/schema.ts';
import { found } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export const roomRoutes =
  ({ db, files }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const getRoom = (id: number) =>
      found(db.select().from(rooms).where(eq(rooms.id, id)).get(), 'Rummet');

    app.get('/rooms', async () => {
      const spent = db
        .select({
          roomId: expenses.roomId,
          spentOre: sql<number>`sum(${expenses.amountOre})`.as('spent_ore'),
        })
        .from(expenses)
        .groupBy(expenses.roomId)
        .as('spent');
      return db
        .select({ room: rooms, spentOre: sql<number>`coalesce(${spent.spentOre}, 0)` })
        .from(rooms)
        .leftJoin(spent, eq(spent.roomId, rooms.id))
        .orderBy(asc(rooms.name))
        .all()
        .map(({ room, spentOre }) => ({ ...room, spentOre }));
    });

    app.get('/rooms/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const room = getRoom(id);
      const projectIds = db
        .select({ id: projectRooms.projectId })
        .from(projectRooms)
        .where(eq(projectRooms.roomId, id))
        .all()
        .map((r) => r.id);
      const roomMeasurements = db
        .select()
        .from(measurements)
        .where(eq(measurements.roomId, id))
        .orderBy(asc(measurements.id))
        .all();
      return { ...room, projectIds, measurements: roomMeasurements };
    });

    app.post('/rooms', async (req, reply) => {
      const data = parse(roomCreateSchema, req.body);
      reply.status(201);
      return db.insert(rooms).values(data).returning().get();
    });

    app.patch('/rooms/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(roomUpdateSchema, req.body);
      getRoom(id);
      return db
        .update(rooms)
        .set({ ...data, updatedAt: nowIso() })
        .where(eq(rooms.id, id))
        .returning()
        .get();
    });

    app.delete('/rooms/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      getRoom(id);
      // Rummets egna bilagor försvinner via cascade; filerna på disk tas bort efteråt.
      const stored = db
        .select({ name: attachments.storedName })
        .from(attachments)
        .where(eq(attachments.roomId, id))
        .all()
        .map((a) => a.name);
      db.delete(rooms).where(eq(rooms.id, id)).run();
      await files.remove(stored);
      reply.status(204);
    });

    // Mått
    app.get('/rooms/:id/measurements', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      getRoom(id);
      return db
        .select()
        .from(measurements)
        .where(eq(measurements.roomId, id))
        .orderBy(asc(measurements.id))
        .all();
    });

    app.post('/rooms/:id/measurements', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(measurementCreateSchema, req.body);
      getRoom(id);
      reply.status(201);
      return db
        .insert(measurements)
        .values({ ...data, roomId: id })
        .returning()
        .get();
    });

    app.patch('/measurements/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(measurementUpdateSchema, req.body);
      return found(
        db
          .update(measurements)
          .set({ ...data, updatedAt: nowIso() })
          .where(eq(measurements.id, id))
          .returning()
          .get(),
        'Måttet',
      );
    });

    app.delete('/measurements/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(db.delete(measurements).where(eq(measurements.id, id)).returning().get(), 'Måttet');
      reply.status(204);
    });
  };
