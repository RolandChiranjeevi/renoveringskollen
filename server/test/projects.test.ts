import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('projekt', () => {
  let ctx: TestCtx;
  let kok: number;
  let badrum: number;

  const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url, payload });

  beforeEach(async () => {
    ctx = createTestApp();
    kok = (await req('POST', '/api/rooms', { name: 'Kök' })).json().id;
    badrum = (await req('POST', '/api/rooms', { name: 'Badrum' })).json().id;
  });
  afterEach(() => ctx.close());

  it('skapar projekt med rum och returnerar sammanställning', async () => {
    const res = await req('POST', '/api/projects', {
      title: 'Nytt kök',
      budgetOre: 10_000_000,
      startDate: '2026-09-01',
      roomIds: [kok, kok],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      title: 'Nytt kök',
      status: 'planerad',
      roomIds: [kok],
      spentOre: 0,
      taskCount: 0,
      contractor: null,
    });
  });

  it('räknar spenderat belopp och uppgifter', async () => {
    const p = (await req('POST', '/api/projects', { title: 'Kök' })).json();
    await req('POST', `/api/projects/${p.id}/expenses`, {
      date: '2026-09-02',
      description: 'Kakel',
      category: 'material',
      amountOre: 150_000,
    });
    await req('POST', `/api/projects/${p.id}/expenses`, {
      date: '2026-09-03',
      description: 'Snickare',
      category: 'arbete',
      amountOre: 500_000,
    });
    await req('POST', `/api/projects/${p.id}/tasks`, { title: 'Riv', done: true });
    await req('POST', `/api/projects/${p.id}/tasks`, { title: 'Kakla' });

    const detail = (await req('GET', `/api/projects/${p.id}`)).json();
    expect(detail).toMatchObject({ spentOre: 650_000, taskCount: 2, tasksDone: 1 });
  });

  it('filtrerar på status och rum', async () => {
    await req('POST', '/api/projects', { title: 'A', status: 'klar', roomIds: [kok] });
    await req('POST', '/api/projects', { title: 'B', status: 'pagaende', roomIds: [badrum] });

    const klara = (await req('GET', '/api/projects?status=klar')).json();
    expect(klara.map((p: { title: string }) => p.title)).toEqual(['A']);
    const iBadrum = (await req('GET', `/api/projects?roomId=${badrum}`)).json();
    expect(iBadrum.map((p: { title: string }) => p.title)).toEqual(['B']);
    expect((await req('GET', '/api/projects?status=okand')).statusCode).toBe(400);
  });

  it('ersätter rum vid uppdatering och kopplar hantverkare', async () => {
    const c = (
      await req('POST', '/api/contractors', { name: 'Snickare AB', email: 'info@snickare.example' })
    ).json();
    const p = (await req('POST', '/api/projects', { title: 'X', roomIds: [kok] })).json();
    const res = await req('PATCH', `/api/projects/${p.id}`, {
      roomIds: [badrum],
      contractorId: c.id,
    });
    expect(res.json()).toMatchObject({ roomIds: [badrum], contractor: { name: 'Snickare AB' } });
  });

  it('nekar slutdatum före startdatum, även vid delvis uppdatering', async () => {
    const bad = await req('POST', '/api/projects', {
      title: 'X',
      startDate: '2026-05-01',
      endDate: '2026-04-01',
    });
    expect(bad.statusCode).toBe(400);

    const p = (await req('POST', '/api/projects', { title: 'X', startDate: '2026-05-01' })).json();
    const res = await req('PATCH', `/api/projects/${p.id}`, { endDate: '2026-04-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe('endDate');
  });

  it('ger 400 för rum eller hantverkare som inte finns', async () => {
    const res = await req('POST', '/api/projects', { title: 'X', roomIds: [999] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_REFERENCE');
    // Transaktionen rullas tillbaka – inget halvt skapat projekt.
    expect((await req('GET', '/api/projects')).json()).toEqual([]);
  });

  it('tar bort projekt med allt innehåll', async () => {
    const p = (await req('POST', '/api/projects', { title: 'X' })).json();
    const e = (
      await req('POST', `/api/projects/${p.id}/expenses`, {
        date: '2026-01-01',
        description: 'Y',
        category: 'ovrigt',
        amountOre: 1,
      })
    ).json();
    expect((await req('DELETE', `/api/projects/${p.id}`)).statusCode).toBe(204);
    expect((await req('GET', `/api/expenses/${e.id}`)).statusCode).toBe(404);
    expect((await req('DELETE', `/api/projects/${p.id}`)).statusCode).toBe(404);
  });
});
