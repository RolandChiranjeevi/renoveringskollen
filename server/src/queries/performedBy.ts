import { eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client.ts';
import { contractors, expenses, projects } from '../db/schema.ts';

/**
 * Vem som utfört arbetet i varje projekt, i den här ordningen:
 * 1. hantverkare kopplade till arbetskostnader,
 * 2. butik/firma på arbetskostnader utan kopplad hantverkare,
 * 3. projektets egen hantverkare.
 * Tom lista betyder eget arbete.
 */
export function performedByProjects(db: Db, projectIds: number[]): Map<number, string[]> {
  const result = new Map<number, string[]>(projectIds.map((id) => [id, []]));
  if (projectIds.length === 0) return result;

  const add = (projectId: number, name: string | null | undefined) => {
    const list = result.get(projectId);
    const clean = name?.trim();
    if (!list || !clean) return;
    const key = clean.toLocaleLowerCase('sv-SE');
    if (!list.some((n) => n.toLocaleLowerCase('sv-SE') === key)) list.push(clean);
  };

  const labor = db
    .select({
      projectId: expenses.projectId,
      category: expenses.category,
      contractorName: contractors.name,
      store: expenses.store,
    })
    .from(expenses)
    .leftJoin(contractors, eq(contractors.id, expenses.contractorId))
    .where(inArray(expenses.projectId, projectIds))
    .orderBy(expenses.date, expenses.id)
    .all()
    .filter((r) => r.category === 'arbete');
  for (const r of labor) if (r.contractorName) add(r.projectId, r.contractorName);
  for (const r of labor) if (!r.contractorName) add(r.projectId, r.store);

  const projectContractor = alias(contractors, 'project_contractor');
  const withContractor = db
    .select({ id: projects.id, name: projectContractor.name })
    .from(projects)
    .innerJoin(projectContractor, eq(projectContractor.id, projects.contractorId))
    .where(inArray(projects.id, projectIds))
    .all();
  for (const p of withContractor) add(p.id, p.name);

  return result;
}
