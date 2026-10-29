import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db/client.ts';
import { FileStore } from '../src/storage/files.ts';
import { createTestApp } from './helpers.ts';

describe('app', () => {
  let ctx: ReturnType<typeof createTestApp>;
  afterEach(async () => ctx?.close());

  it('svarar ok på /api/health', async () => {
    ctx = createTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returnerar enhetligt felformat för okända routes', async () => {
    ctx = createTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/finns-inte' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Hittades inte' } });
  });

  it('sätter den inloggade användaren på skyddade routes', async () => {
    ctx = createTestApp();
    let seenUser: unknown;
    ctx.app.addHook('onResponse', async (request) => {
      seenUser = request.user;
    });
    await ctx.app.inject({ method: 'GET', url: '/api/rooms' });
    expect(seenUser).toMatchObject({ name: 'Testägare', role: 'owner' });
  });

  it('skickar säkerhetsrubriker', async () => {
    ctx = createTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'");
  });

  it('ger webbappen sin CSP även vid 304 och för klientens egna sidor', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'reno-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Test</title>');
    const handle = openDb(':memory:');
    const app = buildApp({ db: handle.db, files: new FileStore(dist), webDist: dist });
    try {
      const first = await app.inject({ method: 'GET', url: '/' });
      expect(first.statusCode).toBe(200);
      expect(first.headers['content-security-policy']).toContain("script-src 'self'");

      // Webbläsaren frågar om sidan ändrats; svaret saknar då Content-Type.
      const cached = await app.inject({
        method: 'GET',
        url: '/',
        headers: { 'if-none-match': String(first.headers.etag) },
      });
      expect(cached.statusCode).toBe(304);
      expect(cached.headers['content-security-policy']).toContain("script-src 'self'");

      const clientRoute = await app.inject({ method: 'GET', url: '/projekt/5' });
      expect(clientRoute.statusCode).toBe(200);
      expect(clientRoute.headers['content-security-policy']).toContain("script-src 'self'");
    } finally {
      await app.close();
      handle.close();
      fs.rmSync(dist, { recursive: true, force: true });
    }
  });
});
