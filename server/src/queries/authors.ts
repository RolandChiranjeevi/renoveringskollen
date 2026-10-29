import type { Db } from '../db/client.ts';
import { users } from '../db/schema.ts';

/**
 * Lägger till `createdByName` på rader som har `createdBy`.
 * Namnet skickas bara med när hushållet har fler än en medlem: för en ensam användare vore
 * "Tillagd av …" på varje rad bara brus. Rader från före E1 saknar upphovsperson och får inget namn.
 */
export function authorLookup(db: Db) {
  const rows = db.select({ id: users.id, name: users.name }).from(users).all();
  const names = new Map(rows.map((u) => [u.id, u.name]));
  const show = rows.length > 1;
  return <T extends { createdBy: number | null }>(
    row: T,
  ): T & { createdByName: string | null } => ({
    ...row,
    createdByName: show && row.createdBy != null ? (names.get(row.createdBy) ?? null) : null,
  });
}
