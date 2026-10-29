import type { FastifyPluginAsync } from 'fastify';
import {
  EXPENSE_CATEGORY_LABELS,
  expenseSearchSchema,
  type ExpenseSearchResult,
} from '@reno/shared';
import { oreToCsv, toCsv } from '../http/csv.ts';
import { parse } from '../http/validate.ts';
import { searchExpenses } from '../queries/expenses.ts';
import type { RouteDeps } from './types.ts';

export const searchRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/expenses', async (req): Promise<ExpenseSearchResult> => {
      const items = searchExpenses(db, parse(expenseSearchSchema, req.query));
      return { items, count: items.length, totalOre: items.reduce((s, e) => s + e.amountOre, 0) };
    });

    app.get('/export/expenses.csv', async (req, reply) => {
      const items = searchExpenses(db, parse(expenseSearchSchema, req.query));
      const csv = toCsv(
        [
          'Datum',
          'Projekt',
          'Rum',
          'Beskrivning',
          'Butik/firma',
          'Kategori',
          'Belopp (kr)',
          'Kvitto',
        ],
        items.map((e) => [
          e.date,
          e.projectTitle,
          e.roomName,
          e.description,
          e.store,
          EXPENSE_CATEGORY_LABELS[e.category],
          oreToCsv(e.amountOre),
          e.attachmentCount > 0 ? 'Ja' : 'Nej',
        ]),
      );
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="utgifter-${date}.csv"`)
        .send(csv);
    });
  };
