import fs from 'node:fs';
import Database from 'better-sqlite3';
import { BackupService, DEFAULT_KEEP } from '../backup/backupService.ts';
import { loadConfig } from '../config.ts';

// Användning: npm run backup -- [--keep 10]
// Skapar backups/renoveringskollen-ÅÅÅÅMMDD-HHMMSS.tar.gz med databasen och alla uppladdade filer.
// Säkert att köra medan appen är igång: SQLites backup-API ger en konsekvent ögonblicksbild.
// Samma sak går att göra från appen under Konto (bara ägaren).

const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const keep = keepIdx >= 0 ? Number(args[keepIdx + 1]) : DEFAULT_KEEP;
if (!Number.isInteger(keep) || keep < 1) {
  console.error('--keep måste vara ett heltal ≥ 1');
  process.exit(1);
}

const config = loadConfig();
if (!fs.existsSync(config.databasePath)) {
  console.error(`Ingen databas på ${config.databasePath} – inget att säkerhetskopiera.`);
  process.exit(1);
}

const sqlite = new Database(config.databasePath, { readonly: true, fileMustExist: true });
const backups = new BackupService({
  backupDir: config.backupDir,
  uploadsDir: config.uploadsDir,
  snapshotDb: async (dest) => {
    await sqlite.backup(dest);
  },
  keep,
});

try {
  const result = await backups.create();
  const sizeMb = (result.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',');
  console.log(
    `Säkerhetskopia skapad: ${backups.dir}/${result.name} (${sizeMb} MB, ${result.files} filer)`,
  );
  if (result.removed) {
    console.log(`Tog bort ${result.removed} äldre säkerhetskopior (behåller ${keep}).`);
  }
} finally {
  sqlite.close();
}
