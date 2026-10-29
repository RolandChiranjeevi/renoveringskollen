import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('utgifter och uppgifter', () => {
  let ctx: TestCtx;
  let projectId: number;

  const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url, payload });

  beforeEach(async () => {
    ctx = createTestApp();
    projectId = (await req('POST', '/api/projects', { title: 'Badrum' })).json().id;
  });
  afterEach(() => ctx.close());

  describe('utgifter', () => {
    const expense = {
      date: '2026-10-01',
      description: 'Klinker',
      category: 'material',
      amountOre: 349_900,
    };

    it('skapar och listar senaste först', async () => {
      await req('POST', `/api/projects/${projectId}/expenses`, expense);
      await req('POST', `/api/projects/${projectId}/expenses`, {
        ...expense,
        date: '2026-10-05',
        description: 'Fog',
      });
      const list = (await req('GET', `/api/projects/${projectId}/expenses`)).json();
      expect(list.map((e: { description: string }) => e.description)).toEqual(['Fog', 'Klinker']);
    });

    it('nekar decimalöre, negativa belopp, okänd kategori och ogiltigt datum', async () => {
      for (const bad of [
        { ...expense, amountOre: 10.5 },
        { ...expense, amountOre: -100 },
        { ...expense, category: 'mat' },
        { ...expense, date: '2026-13-01' },
      ]) {
        const res = await req('POST', `/api/projects/${projectId}/expenses`, bad);
        expect(res.statusCode, JSON.stringify(bad)).toBe(400);
      }
    });

    it('ger svenska felmeddelanden', async () => {
      const res = await req('POST', `/api/projects/${projectId}/expenses`, {
        ...expense,
        category: 'mat',
      });
      expect(res.json().error.details[0].message).toMatch(/^Ogiltigt val/);
    });

    it('uppdaterar och tar bort', async () => {
      const e = (await req('POST', `/api/projects/${projectId}/expenses`, expense)).json();
      const patched = await req('PATCH', `/api/expenses/${e.id}`, {
        amountOre: 300_000,
        store: 'Bauhaus',
      });
      expect(patched.json()).toMatchObject({
        amountOre: 300_000,
        store: 'Bauhaus',
        description: 'Klinker',
      });
      expect((await req('DELETE', `/api/expenses/${e.id}`)).statusCode).toBe(204);
      expect((await req('PATCH', `/api/expenses/${e.id}`, { amountOre: 1 })).statusCode).toBe(404);
    });

    it('ger 404 för projekt som inte finns', async () => {
      expect((await req('POST', '/api/projects/999/expenses', expense)).statusCode).toBe(404);
    });
  });

  describe('uppgifter', () => {
    it('sätter och nollar completedAt när uppgiften bockas av', async () => {
      const t = (
        await req('POST', `/api/projects/${projectId}/tasks`, { title: 'Riv kakel' })
      ).json();
      expect(t).toMatchObject({ done: false, priority: 'medel', completedAt: null });

      const done = (await req('PATCH', `/api/tasks/${t.id}`, { done: true })).json();
      expect(done.completedAt).toMatch(/^\d{4}-/);

      const renamed = (
        await req('PATCH', `/api/tasks/${t.id}`, { title: 'Riv allt kakel' })
      ).json();
      expect(renamed.completedAt).toBe(done.completedAt);

      const undone = (await req('PATCH', `/api/tasks/${t.id}`, { done: false })).json();
      expect(undone.completedAt).toBeNull();
    });

    it('sorterar ej klara först och sedan på prioritet', async () => {
      for (const [title, priority, done] of [
        ['låg', 'lag', false],
        ['klar', 'hog', true],
        ['hög', 'hog', false],
        ['medel', 'medel', false],
      ] as const) {
        await req('POST', `/api/projects/${projectId}/tasks`, { title, priority, done });
      }
      const list = (await req('GET', `/api/projects/${projectId}/tasks`)).json();
      expect(list.map((t: { title: string }) => t.title)).toEqual(['hög', 'medel', 'låg', 'klar']);
    });
  });
});
