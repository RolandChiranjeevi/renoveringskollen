import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { expenseCreateSchema, expenseUpdateSchema, idParamSchema } from '@reno/shared';
import { attachments, expenses, projects, tasks } from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { authorLookup } from '../queries/authors.ts';
import { attachmentCounts } from '../queries/expenses.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export const expenseRoutes =
  ({ db, files }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const requireProject = (id: number) =>
      found(
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get(),
        'Projektet',
      );

    // En utgift får bara kopplas till en uppgift i samma projekt.
    const assertTaskInProject = (taskId: number | null | undefined, projectId: number) => {
      if (taskId == null) return;
      const task = db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .get();
      if (task?.projectId !== projectId) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'taskId', message: 'Uppgiften hör inte till det här projektet' },
        ]);
      }
    };

    app.get('/projects/:id/expenses', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      requireProject(id);
      const counts = attachmentCounts(db);
      const withAuthor = authorLookup(db);
      return db
        .select({ expense: expenses, attachmentCount: sql<number>`coalesce(${counts.n}, 0)` })
        .from(expenses)
        .leftJoin(counts, eq(counts.expenseId, expenses.id))
        .where(eq(expenses.projectId, id))
        .orderBy(desc(expenses.date), desc(expenses.id))
        .all()
        .map(({ expense, attachmentCount }) => withAuthor({ ...expense, attachmentCount }));
    });

    app.post('/projects/:id/expenses', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(expenseCreateSchema, req.body);
      requireProject(id);
      assertTaskInProject(data.taskId, id);
      reply.status(201);
      return authorLookup(db)(
        db
          .insert(expenses)
          .values({ ...data, projectId: id, createdBy: req.user.id })
          .returning()
          .get(),
      );
    });

    app.get('/expenses/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      return authorLookup(db)(
        found(db.select().from(expenses).where(eq(expenses.id, id)).get(), 'Utgiften'),
      );
    });

    app.patch('/expenses/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const data = parse(expenseUpdateSchema, req.body);
      const current = found(
        db
          .select({ projectId: expenses.projectId })
          .from(expenses)
          .where(eq(expenses.id, id))
          .get(),
        'Utgiften',
      );
      assertTaskInProject(data.taskId, current.projectId);
      return authorLookup(db)(
        found(
          db
            .update(expenses)
            .set({ ...data, updatedAt: nowIso() })
            .where(eq(expenses.id, id))
            .returning()
            .get(),
          'Utgiften',
        ),
      );
    });

    app.delete('/expenses/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const stored = db
        .select({ name: attachments.storedName })
        .from(attachments)
        .where(eq(attachments.expenseId, id))
        .all()
        .map((a) => a.name);
      found(db.delete(expenses).where(eq(expenses.id, id)).returning().get(), 'Utgiften');
      await files.remove(stored);
      reply.status(204);
    });
  };
