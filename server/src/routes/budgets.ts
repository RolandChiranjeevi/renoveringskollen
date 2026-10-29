import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  EXPENSE_CATEGORIES,
  idParamSchema,
  projectBudgetsSchema,
  type ProjectBudgets,
} from '@reno/shared';
import type { Db } from '../db/client.ts';
import { expenses, projectBudgets, projects } from '../db/schema.ts';
import { found } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

/** Budget och utfall per kategori. Kategorier utan budget visas med 0, så att all spenderad kostnad syns. */
function readBudgets(db: Db, projectId: number, projectBudgetOre: number): ProjectBudgets {
  const budget = new Map(
    db
      .select()
      .from(projectBudgets)
      .where(eq(projectBudgets.projectId, projectId))
      .all()
      .map((b) => [b.category, b.budgetOre]),
  );
  const spent = new Map(
    db
      .select({ category: expenses.category, total: sql<number>`sum(${expenses.amountOre})` })
      .from(expenses)
      .where(eq(expenses.projectId, projectId))
      .groupBy(expenses.category)
      .all()
      .map((r) => [r.category, r.total]),
  );
  const categories = EXPENSE_CATEGORIES.map((category) => ({
    category,
    budgetOre: budget.get(category) ?? 0,
    spentOre: spent.get(category) ?? 0,
  }));
  return {
    projectBudgetOre,
    allocatedOre: categories.reduce((s, c) => s + c.budgetOre, 0),
    categories,
  };
}

export const budgetRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const getProject = (id: number) =>
      found(
        db
          .select({ budgetOre: projects.budgetOre })
          .from(projects)
          .where(eq(projects.id, id))
          .get(),
        'Projektet',
      );

    app.get('/projects/:id/budgets', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      return readBudgets(db, id, getProject(id).budgetOre);
    });

    // Ersätter hela fördelningen. Kategorier med 0 eller utan värde får ingen budget.
    // Kategorierna är en uppdelning av totalbudgeten, så den kan aldrig vara lägre än summan:
    // är summan högre höjs totalbudgeten till summan. Är den lägre lämnas resten som ofördelat.
    app.put('/projects/:id/budgets', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const { budgets } = parse(projectBudgetsSchema, req.body);
      const project = getProject(id);
      const projectBudgetOre = db.transaction((tx) => {
        tx.delete(projectBudgets).where(eq(projectBudgets.projectId, id)).run();
        const rows = EXPENSE_CATEGORIES.flatMap((category) => {
          const budgetOre = budgets[category] ?? 0;
          return budgetOre > 0 ? [{ projectId: id, category, budgetOre }] : [];
        });
        if (rows.length) tx.insert(projectBudgets).values(rows).run();

        const allocated = rows.reduce((s, r) => s + r.budgetOre, 0);
        if (allocated > project.budgetOre) {
          tx.update(projects)
            .set({ budgetOre: allocated, updatedAt: nowIso() })
            .where(eq(projects.id, id))
            .run();
          return allocated;
        }
        return project.budgetOre;
      });
      return readBudgets(db, id, projectBudgetOre);
    });
  };
