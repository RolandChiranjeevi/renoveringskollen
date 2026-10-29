import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import {
  idParamSchema,
  maintenanceCreateSchema,
  maintenanceDoneSchema,
  maintenanceUpdateSchema,
  type MaintenanceItem,
  type MaintenanceLogEntry,
} from '@reno/shared';
import type { Db } from '../db/client.ts';
import { maintenanceLog, maintenanceTasks, rooms } from '../db/schema.ts';
import { addMonths, daysBetween, todayIso } from '../http/dates.ts';
import { found, HttpError } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

/** Underhåll räknas som "snart" och tas med i Kommande när det är försenat eller förfaller inom så här många dagar. */
export const MAINTENANCE_SOON_DAYS = 30;

/**
 * Alla jobb med beräknat nästa datum, sorterade med det mest akuta först.
 * Nästa gång = senast gjort + intervall; har det aldrig gjorts används "första gången".
 */
export function listMaintenance(db: Db, today = todayIso(), onlyId?: number): MaintenanceItem[] {
  const tasks = db
    .select({ task: maintenanceTasks, roomName: rooms.name })
    .from(maintenanceTasks)
    .leftJoin(rooms, eq(rooms.id, maintenanceTasks.roomId))
    .where(onlyId === undefined ? undefined : eq(maintenanceTasks.id, onlyId))
    .all();
  const logs = new Map(
    db
      .select({
        id: maintenanceLog.maintenanceId,
        last: sql<string>`max(${maintenanceLog.doneOn})`,
        n: sql<number>`count(*)`,
      })
      .from(maintenanceLog)
      .groupBy(maintenanceLog.maintenanceId)
      .all()
      .map((l) => [l.id, l]),
  );

  const items = tasks.map(({ task, roomName }): MaintenanceItem => {
    const log = logs.get(task.id);
    const lastDoneOn = log?.last ?? null;
    const dueOn = lastDoneOn ? addMonths(lastDoneOn, task.intervalMonths) : task.firstDueOn;
    const daysLeft = dueOn ? daysBetween(today, dueOn) : null;
    return {
      id: task.id,
      title: task.title,
      roomId: task.roomId,
      roomName,
      intervalMonths: task.intervalMonths,
      firstDueOn: task.firstDueOn,
      notes: task.notes,
      lastDoneOn,
      dueOn,
      daysLeft,
      status:
        daysLeft === null
          ? 'unscheduled'
          : daysLeft < 0
            ? 'overdue'
            : daysLeft <= MAINTENANCE_SOON_DAYS
              ? 'soon'
              : 'later',
      doneCount: log?.n ?? 0,
    };
  });
  return items.sort(
    (a, b) =>
      (a.dueOn ?? '9999-12-31').localeCompare(b.dueOn ?? '9999-12-31') ||
      a.title.localeCompare(b.title, 'sv'),
  );
}

/** "Gjort"-datum får inte ligga i framtiden. */
function assertNotFuture(date: string | null | undefined, path: string) {
  if (date && date > todayIso()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
      {
        path,
        message:
          'Datumet ligger i framtiden – det går bara att registrera sådant som redan är gjort',
      },
    ]);
  }
}

export const maintenanceRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const getItem = (id: number) =>
      found(listMaintenance(db, todayIso(), id)[0], 'Underhållsjobbet');

    app.get('/maintenance', async () => listMaintenance(db));

    app.post('/maintenance', async (req, reply) => {
      const { lastDoneOn, ...data } = parse(maintenanceCreateSchema, req.body);
      assertNotFuture(lastDoneOn, 'lastDoneOn');
      const id = db.transaction((tx) => {
        const created = tx
          .insert(maintenanceTasks)
          .values(data)
          .returning({ id: maintenanceTasks.id })
          .get();
        if (lastDoneOn) {
          tx.insert(maintenanceLog).values({ maintenanceId: created.id, doneOn: lastDoneOn }).run();
        }
        return created.id;
      });
      reply.status(201);
      return getItem(id);
    });

    app.patch('/maintenance/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(maintenanceUpdateSchema, req.body);
      found(
        db
          .update(maintenanceTasks)
          .set({ ...data, updatedAt: nowIso() })
          .where(eq(maintenanceTasks.id, id))
          .returning({ id: maintenanceTasks.id })
          .get(),
        'Underhållsjobbet',
      );
      return getItem(id);
    });

    app.delete('/maintenance/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(
        db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id)).returning().get(),
        'Underhållsjobbet',
      );
      reply.status(204);
    });

    // Markera som gjord: lägger till en post i historiken, och nästa datum räknas om från den.
    app.post('/maintenance/:id/done', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const { doneOn, note } = parse(maintenanceDoneSchema, req.body);
      getItem(id);
      assertNotFuture(doneOn, 'doneOn');
      db.insert(maintenanceLog)
        .values({ maintenanceId: id, doneOn: doneOn ?? todayIso(), note: note ?? null })
        .run();
      reply.status(201);
      return getItem(id);
    });

    app.get('/maintenance/:id/history', async (req): Promise<MaintenanceLogEntry[]> => {
      const { id } = parse(idParamSchema, req.params);
      getItem(id);
      return db
        .select()
        .from(maintenanceLog)
        .where(eq(maintenanceLog.maintenanceId, id))
        .orderBy(desc(maintenanceLog.doneOn), desc(maintenanceLog.id))
        .all();
    });

    // Ta bort en felaktig post i historiken; nästa datum räknas om utan den.
    app.delete('/maintenance-log/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(db.delete(maintenanceLog).where(eq(maintenanceLog.id, id)).returning().get(), 'Posten');
      reply.status(204);
    });
  };
