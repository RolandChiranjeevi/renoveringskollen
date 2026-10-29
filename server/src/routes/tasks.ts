import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';
import { idParamSchema, taskCreateSchema, taskUpdateSchema } from '@reno/shared';
import { expenses, projects, tasks } from '../db/schema.ts';
import { found } from '../http/errors.ts';
import { authorLookup } from '../queries/authors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export const taskRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/tasks', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      found(
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get(),
        'Projektet',
      );
      // Utfall per uppgift: summan av kopplade utgifter.
      const spent = db
        .select({
          taskId: expenses.taskId,
          total: sql<number>`sum(${expenses.amountOre})`.as('total'),
        })
        .from(expenses)
        .where(eq(expenses.projectId, id))
        .groupBy(expenses.taskId)
        .as('spent');
      // Ej klara först, sedan efter prioritet och ordning de skapades.
      const withAuthor = authorLookup(db);
      return db
        .select({ task: tasks, spentOre: sql<number>`coalesce(${spent.total}, 0)` })
        .from(tasks)
        .leftJoin(spent, eq(spent.taskId, tasks.id))
        .where(eq(tasks.projectId, id))
        .orderBy(
          asc(tasks.done),
          sql`case ${tasks.priority} when 'hog' then 0 when 'medel' then 1 else 2 end`,
          asc(tasks.id),
        )
        .all()
        .map(({ task, spentOre }) => withAuthor({ ...task, spentOre }));
    });

    app.post('/projects/:id/tasks', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(taskCreateSchema, req.body);
      found(
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get(),
        'Projektet',
      );
      reply.status(201);
      return authorLookup(db)(
        db
          .insert(tasks)
          .values({
            ...data,
            projectId: id,
            completedAt: data.done ? nowIso() : null,
            createdBy: req.user.id,
          })
          .returning()
          .get(),
      );
    });

    app.patch('/tasks/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(taskUpdateSchema, req.body);
      const current = found(db.select().from(tasks).where(eq(tasks.id, id)).get(), 'Uppgiften');
      const completedAt =
        data.done === undefined || data.done === current.done
          ? current.completedAt
          : data.done
            ? nowIso()
            : null;
      return authorLookup(db)(
        db
          .update(tasks)
          .set({ ...data, completedAt, updatedAt: nowIso() })
          .where(eq(tasks.id, id))
          .returning()
          .get(),
      );
    });

    app.delete('/tasks/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      found(db.delete(tasks).where(eq(tasks.id, id)).returning().get(), 'Uppgiften');
      reply.status(204);
    });
  };
