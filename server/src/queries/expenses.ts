import { and, asc, desc, eq, gte, lte, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { ExpenseSearchItem, expenseSearchSchema } from '@reno/shared';
import type { z } from 'zod';
import type { Db } from '../db/client.ts';
import { attachments, expenses, projects, rooms } from '../db/schema.ts';
import { authorLookup } from './authors.ts';

/** Antal bilagor per utgift, som subquery att left-joina mot expenses. */
export function attachmentCounts(db: Db) {
  return db
    .select({ expenseId: attachments.expenseId, n: sql<number>`count(*)`.as('n') })
    .from(attachments)
    .groupBy(attachments.expenseId)
    .as('attachment_counts');
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchExpenses(
  db: Db,
  f: z.output<typeof expenseSearchSchema>,
): ExpenseSearchItem[] {
  const where: SQL[] = [];
  if (f.from) where.push(gte(expenses.date, f.from));
  if (f.to) where.push(lte(expenses.date, f.to));
  if (f.category) where.push(eq(expenses.category, f.category));
  if (f.roomId) where.push(eq(expenses.roomId, f.roomId));
  if (f.projectId) where.push(eq(expenses.projectId, f.projectId));
  if (f.q) {
    const pattern = `%${escapeLike(f.q.toLocaleLowerCase('sv-SE'))}%`;
    const match = (col: SQLWrapper) => sql`sv_lower(${col}) like ${pattern} escape '\\'`;
    where.push(
      sql`(${match(expenses.description)} or ${match(sql`coalesce(${expenses.store}, '')`)} or ${match(projects.title)})`,
    );
  }

  const counts = attachmentCounts(db);
  const withAuthor = authorLookup(db);
  const dir = f.order === 'asc' ? asc : desc;
  const primary = f.sort === 'amount' ? dir(expenses.amountOre) : dir(expenses.date);

  return db
    .select({
      expense: expenses,
      projectTitle: projects.title,
      roomName: rooms.name,
      attachmentCount: sql<number>`coalesce(${counts.n}, 0)`,
    })
    .from(expenses)
    .innerJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(rooms, eq(rooms.id, expenses.roomId))
    .leftJoin(counts, eq(counts.expenseId, expenses.id))
    .where(and(...where))
    .orderBy(primary, dir(expenses.id))
    .all()
    .map(({ expense, ...rest }) => withAuthor({ ...expense, ...rest }));
}
