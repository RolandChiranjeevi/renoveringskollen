import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Så här många kopior sparas; äldre tas bort när en ny skapas. */
export const DEFAULT_KEEP = 10;

const NAME = /^renoveringskollen-\d{8}-\d{6}\.tar\.gz$/;

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  /** När kopian skapades (ISO). */
  createdAt: string;
}

export interface BackupResult extends BackupInfo {
  /** Antal uppladdade filer som kom med. */
  files: number;
  /** Antal äldre kopior som togs bort. */
  removed: number;
}

export interface BackupOptions {
  /** Mappen kopiorna sparas i. */
  backupDir: string;
  uploadsDir: string;
  /** Skriver en konsekvent ögonblicksbild av databasen till sökvägen (SQLites backup-API). */
  snapshotDb: (dest: string) => Promise<void>;
  keep?: number;
}

/**
 * Skapar och listar säkerhetskopior: en .tar.gz med databasen och alla uppladdade filer.
 * Delas av `npm run backup` och knappen under Konto. Säkert att köra medan appen är igång.
 */
export class BackupService {
  private running = false;

  constructor(private readonly opts: BackupOptions) {}

  get dir(): string {
    return this.opts.backupDir;
  }

  async create(): Promise<BackupResult> {
    // Två kopior samtidigt skulle bara konkurrera om disken och om samma filnamn.
    if (this.running) throw new BackupBusyError();
    this.running = true;
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'reno-backup-'));
    try {
      await this.opts.snapshotDb(path.join(staging, 'renoveringskollen.db'));

      const stagedUploads = path.join(staging, 'uploads');
      try {
        await fs.cp(this.opts.uploadsDir, stagedUploads, { recursive: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        await fs.mkdir(stagedUploads);
      }

      await fs.mkdir(this.opts.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const name = `renoveringskollen-${stamp}.tar.gz`;
      const target = path.join(this.opts.backupDir, name);
      // tar finns på macOS, Linux och Windows 10+.
      await run('tar', ['-czf', target, '-C', staging, 'renoveringskollen.db', 'uploads']);

      const stat = await fs.stat(target);
      const files = (await fs.readdir(stagedUploads)).length;
      const removed = await this.prune();
      return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), files, removed };
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
      this.running = false;
    }
  }

  /** Alla kopior, nyaste först. */
  async list(): Promise<BackupInfo[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.opts.backupDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return Promise.all(
      names
        .filter((n) => NAME.test(n))
        .sort()
        .reverse()
        .map(async (name) => {
          const stat = await fs.stat(path.join(this.opts.backupDir, name));
          return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
        }),
    );
  }

  /** Sökvägen till en kopia, eller undefined om namnet inte är en av våra kopior eller filen saknas. */
  async pathFor(name: string): Promise<string | undefined> {
    if (!NAME.test(name)) return undefined;
    const full = path.join(this.opts.backupDir, name);
    try {
      await fs.access(full);
    } catch {
      return undefined;
    }
    return full;
  }

  private async prune(): Promise<number> {
    const keep = this.opts.keep ?? DEFAULT_KEEP;
    const old = (await this.list()).slice(keep);
    await Promise.all(old.map((b) => fs.rm(path.join(this.opts.backupDir, b.name))));
    return old.length;
  }
}

export class BackupBusyError extends Error {
  constructor() {
    super('En säkerhetskopia skapas redan');
  }
}
