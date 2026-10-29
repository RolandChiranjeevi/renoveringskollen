import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { migrationsFolder } from '../config.ts';
import * as schema from './schema.ts';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => void;
  /** Skriver en konsekvent ögonblicksbild av databasen (SQLites backup-API) – säkert medan appen används. */
  snapshot: (dest: string) => Promise<void>;
}

/** Öppnar databasen. Använd ':memory:' i tester. */
export function openDb(databasePath: string, options: { migrate?: boolean } = {}): DbHandle {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // SQLites lower() hanterar bara ASCII; den här klarar även å, ä och ö.
  sqlite.function('sv_lower', { deterministic: true }, (v: unknown) =>
    typeof v === 'string' ? v.toLocaleLowerCase('sv-SE') : v,
  );
  const db = drizzle(sqlite, { schema });
  if (options.migrate ?? true) {
    migrate(db, { migrationsFolder });
  }
  return {
    db,
    close: () => sqlite.close(),
    snapshot: async (dest) => {
      await sqlite.backup(dest);
    },
  };
}
