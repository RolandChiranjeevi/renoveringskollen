import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import type { Upcoming } from '@reno/shared';
import { projects, tasks } from '../db/schema.ts';
import { addDays, daysBetween, todayIso } from '../http/dates.ts';
import { performedByProjects } from '../queries/performedBy.ts';
import { listMaintenance, MAINTENANCE_SOON_DAYS } from './maintenance.ts';
import type { RouteDeps } from './types.ts';

/** Uppgifter visas när de är försenade eller förfaller inom så här många dagar. */
export const TASK_WINDOW_DAYS = 30;
/** Garantier visas när de löper ut inom så här många dagar. */
export const WARRANTY_WINDOW_DAYS = 90;

export const upcomingRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/upcoming', async (): Promise<Upcoming> => {
      const today = todayIso();

      // Försenade först (äldst först), sedan de som förfaller inom fönstret. Klara uppgifter räknas inte.
      const taskRows = db
        .select({
          id: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          projectTitle: projects.title,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(
          and(
            eq(tasks.done, false),
            isNotNull(tasks.dueDate),
            lte(tasks.dueDate, addDays(today, TASK_WINDOW_DAYS)),
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.id))
        .all();

      const warrantyRows = db
        .select({ id: projects.id, title: projects.title, warrantyUntil: projects.warrantyUntil })
        .from(projects)
        .where(
          and(
            isNotNull(projects.warrantyUntil),
            gte(projects.warrantyUntil, today),
            lte(projects.warrantyUntil, addDays(today, WARRANTY_WINDOW_DAYS)),
          ),
        )
        .orderBy(asc(projects.warrantyUntil), asc(projects.id))
        .all();
      const performedBy = performedByProjects(
        db,
        warrantyRows.map((p) => p.id),
      );

      return {
        today,
        tasks: taskRows.map((t) => ({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectTitle: t.projectTitle,
          priority: t.priority,
          dueDate: t.dueDate!,
          daysLeft: daysBetween(today, t.dueDate!),
        })),
        warranties: warrantyRows.map((p) => ({
          projectId: p.id,
          title: p.title,
          warrantyUntil: p.warrantyUntil!,
          daysLeft: daysBetween(today, p.warrantyUntil!),
          contractorName: performedBy.get(p.id)?.[0] ?? null,
        })),
        // Underhåll som är försenat eller förfaller inom 30 dagar (listan är redan sorterad, mest akut först).
        maintenance: listMaintenance(db, today)
          .filter(
            (m) => m.dueOn !== null && m.daysLeft !== null && m.daysLeft <= MAINTENANCE_SOON_DAYS,
          )
          .map((m) => ({
            id: m.id,
            title: m.title,
            roomId: m.roomId,
            roomName: m.roomName,
            dueOn: m.dueOn!,
            daysLeft: m.daysLeft!,
          })),
      };
    });
  };
