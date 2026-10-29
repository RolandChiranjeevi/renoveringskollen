import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InjectOptions } from 'fastify';
import { CSRF_HEADER } from '@reno/shared';
import { buildApp } from '../src/app.ts';
import { BackupService } from '../src/backup/backupService.ts';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.ts';
import { openDb } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';
import { FileStore } from '../src/storage/files.ts';

/**
 * Bygger appen mot en tom minnesdatabas.
 * Som standard finns en inloggad ägare: alla app.inject-anrop får sessionscookie och CSRF-rubrik.
 * Med { authenticated: false } skickas inget av det – för tester av själva inloggningen.
 */
export function createTestApp({ authenticated = true } = {}) {
  const handle = openDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reno-test-'));
  const files = new FileStore(uploadsDir);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reno-test-backups-'));
  const backups = new BackupService({
    backupDir,
    uploadsDir,
    snapshotDb: handle.snapshot,
    keep: 3,
  });
  const app = buildApp({ db: handle.db, files, backups });

  let user: typeof users.$inferSelect | undefined;
  if (authenticated) {
    user = handle.db
      .insert(users)
      .values({
        name: 'Testägare',
        email: 'agare@example.test',
        passwordHash: 'oanvänd',
        role: 'owner',
      })
      .returning()
      .get();
    const auth = {
      cookie: `${SESSION_COOKIE}=${createSession(handle.db, user.id)}`,
      [CSRF_HEADER]: '1',
    };
    const inject = app.inject.bind(app);
    app.inject = ((opts: InjectOptions) =>
      inject({ ...opts, headers: { ...auth, ...opts.headers } })) as typeof app.inject;
  }

  return {
    app,
    db: handle.db,
    user,
    uploadsDir,
    backupDir,
    close: async () => {
      await app.close();
      handle.close();
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      fs.rmSync(backupDir, { recursive: true, force: true });
    },
  };
}

export type TestCtx = ReturnType<typeof createTestApp>;

/** Bygger en multipart-body för app.inject. */
export function multipartBody(
  fields: Record<string, string>,
  file?: { name: string; content: Buffer; type?: string },
) {
  const boundary = '----renotest' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`,
      ),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);
export const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'latin1',
);
