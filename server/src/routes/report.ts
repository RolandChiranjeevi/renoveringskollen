import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';
import type { Report } from '@reno/shared';
import { contractors, expenses, projects, rooms, tasks } from '../db/schema.ts';
import { authorLookup } from '../queries/authors.ts';
import { attachmentCounts } from '../queries/expenses.ts';
import { performedByProjects } from '../queries/performedBy.ts';
import { summarize } from './projects.ts';
import type { RouteDeps } from './types.ts';

// Underlag för den utskrivbara renoveringshistoriken.
export const reportRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/report', async (): Promise<Report> => {
      const counts = attachmentCounts(db);
      const withAuthor = authorLookup(db);
      const allExpenses = db
        .select({ expense: expenses, attachmentCount: sql<number>`coalesce(${counts.n}, 0)` })
        .from(expenses)
        .leftJoin(counts, eq(counts.expenseId, expenses.id))
        .orderBy(asc(expenses.date), asc(expenses.id))
        .all()
        .map(({ expense, attachmentCount }) => withAuthor({ ...expense, attachmentCount }));
      const doneTasks = db
        .select()
        .from(tasks)
        .where(eq(tasks.done, true))
        .orderBy(asc(tasks.completedAt))
        .all()
        .map(withAuthor);

      const summaries = summarize(
        db,
        db.select().from(projects).orderBy(asc(projects.startDate), asc(projects.id)).all(),
      );
      const performedBy = performedByProjects(
        db,
        summaries.map((p) => p.id),
      );
      const list = summaries.map((p) => ({
        ...p,
        expenses: allExpenses.filter((e) => e.projectId === p.id),
        tasksCompleted: doneTasks.filter((t) => t.projectId === p.id),
        performedBy: performedBy.get(p.id) ?? [],
      }));

      return {
        generatedAt: new Date().toISOString(),
        totalOre: allExpenses.reduce((s, e) => s + e.amountOre, 0),
        rooms: db.select().from(rooms).orderBy(asc(rooms.name)).all(),
        contractors: db.select().from(contractors).orderBy(asc(contractors.name)).all(),
        projects: list,
      };
    });
  };
