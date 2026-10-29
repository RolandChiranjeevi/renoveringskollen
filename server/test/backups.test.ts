import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.ts';
import { users } from '../src/db/schema.ts';
import { createTestApp, multipartBody, PNG_BYTES, type TestCtx } from './helpers.ts';

describe('säkerhetskopior från appen', () => {
  let ctx: TestCtx;

  const req = (method: 'GET' | 'POST', url: string, headers?: Record<string, string>) =>
    ctx.app.inject({ method, url, headers });
  const list = async () => (await req('GET', '/api/backups')).json();
  const tarList = (file: string) =>
    execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).split('\n').filter(Boolean);

  beforeEach(() => {
    ctx = createTestApp();
  });
  afterEach(() => ctx.close());

  it('skapar en kopia med databasen och alla uppladdade filer', async () => {
    const project = (
      await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'Kök' } })
    ).json();
    const upload = await ctx.app.inject({
      method: 'POST',
      url: '/api/attachments',
      ...multipartBody(
        { kind: 'fore', projectId: String(project.id) },
        { name: 'a.png', content: PNG_BYTES, type: 'image/png' },
      ),
    });
    const stored: string = upload.json().storedName;

    const res = await req('POST', '/api/backups');
    expect(res.statusCode).toBe(201);
    const made = res.json();
    expect(made).toMatchObject({
      name: expect.stringMatching(/^renoveringskollen-\d{8}-\d{6}\.tar\.gz$/),
      files: 1,
      removed: 0,
    });
    expect(made.sizeBytes).toBeGreaterThan(0);

    const entries = tarList(path.join(ctx.backupDir, made.name));
    expect(entries).toEqual(expect.arrayContaining(['renoveringskollen.db', `uploads/${stored}`]));
  });

  it('visar kopiorna nyaste först', async () => {
    expect(await list()).toEqual([]);
    for (const n of ['20200101-000000', '20210101-000000']) {
      fs.writeFileSync(path.join(ctx.backupDir, `renoveringskollen-${n}.tar.gz`), 'x');
    }
    fs.writeFileSync(path.join(ctx.backupDir, 'annan-fil.txt'), 'x');
    const made = (await req('POST', '/api/backups')).json();

    const names = (await list()).map((b: { name: string }) => b.name);
    expect(names).toEqual([
      made.name,
      'renoveringskollen-20210101-000000.tar.gz',
      'renoveringskollen-20200101-000000.tar.gz',
    ]);
  });

  it('behåller bara de senaste och tar bort resten', async () => {
    // Testappen är inställd på att behålla 3.
    for (const n of ['20200101', '20200102', '20200103']) {
      fs.writeFileSync(path.join(ctx.backupDir, `renoveringskollen-${n}-000000.tar.gz`), 'x');
    }
    const made = (await req('POST', '/api/backups')).json();
    expect(made.removed).toBe(1);
    expect((await list()).map((b: { name: string }) => b.name)).toEqual([
      made.name,
      'renoveringskollen-20200103-000000.tar.gz',
      'renoveringskollen-20200102-000000.tar.gz',
    ]);
  });

  it('laddar ner en kopia som en gzip-fil, och bara riktiga kopior', async () => {
    const made = (await req('POST', '/api/backups')).json();
    const dl = await req('GET', `/api/backups/${made.name}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('application/gzip');
    expect(dl.headers['content-disposition']).toBe(`attachment; filename="${made.name}"`);
    expect(dl.headers['cache-control']).toBe('no-store');
    // gzip-huvud
    expect(dl.rawPayload.subarray(0, 2).toString('hex')).toBe('1f8b');
    expect(dl.rawPayload.length).toBe(made.sizeBytes);

    for (const bad of [
      'renoveringskollen-20990101-000000.tar.gz', // finns inte
      'anna.txt',
      '..%2Fpackage.json',
      'renoveringskollen-2020.tar.gz',
    ]) {
      expect((await req('GET', `/api/backups/${bad}/download`)).statusCode, bad).toBe(404);
    }
  });

  it('skapar inte två kopior samtidigt', async () => {
    const [a, b] = await Promise.all([req('POST', '/api/backups'), req('POST', '/api/backups')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    // Därefter går det igen.
    expect((await req('POST', '/api/backups')).statusCode).toBe(201);
  });

  it('är bara för ägaren och kräver inloggning', async () => {
    const member = ctx.db
      .insert(users)
      .values({
        name: 'Erik',
        email: 'erik@example.test',
        passwordHash: 'oanvänd',
        role: 'member',
      })
      .returning()
      .get();
    const asMember = { cookie: `${SESSION_COOKIE}=${createSession(ctx.db, member.id)}` };
    const made = (await req('POST', '/api/backups')).json();
    for (const [method, url] of [
      ['GET', '/api/backups'],
      ['POST', '/api/backups'],
      ['GET', `/api/backups/${made.name}/download`],
    ] as const) {
      expect((await req(method, url, asMember)).statusCode, url).toBe(403);
    }

    const anon = createTestApp({ authenticated: false });
    expect((await anon.app.inject({ method: 'GET', url: '/api/backups' })).statusCode).toBe(401);
    await anon.close();
  });
});
