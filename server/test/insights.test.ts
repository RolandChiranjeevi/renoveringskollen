import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { csvCell } from '../src/http/csv.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('sök, statistik och export', () => {
  let ctx: TestCtx;
  let kok: number;
  let badrum: number;
  let kokProject: number;
  let badProject: number;

  const req = (method: 'GET' | 'POST', url: string, payload?: object) =>
    ctx.app.inject({ method, url, payload });
  const get = async (url: string) => (await req('GET', url)).json();
  const expense = (projectId: number, e: Record<string, unknown>) =>
    req('POST', `/api/projects/${projectId}/expenses`, { category: 'material', ...e });

  beforeEach(async () => {
    ctx = createTestApp();
    kok = (await req('POST', '/api/rooms', { name: 'Kök' })).json().id;
    badrum = (await req('POST', '/api/rooms', { name: 'Badrum' })).json().id;
    const snickare = (
      await req('POST', '/api/contractors', { name: 'Snickare AB', orgNumber: '556677-8899' })
    ).json();
    kokProject = (
      await req('POST', '/api/projects', {
        title: 'Nytt kök',
        budgetOre: 1_000_000,
        roomIds: [kok],
        contractorId: snickare.id,
      })
    ).json().id;
    badProject = (
      await req('POST', '/api/projects', { title: 'Badrum', budgetOre: 100_000, roomIds: [badrum] })
    ).json().id;

    await expense(kokProject, {
      date: '2024-03-10',
      description: 'Köksluckor',
      store: 'IKEA',
      amountOre: 300_000,
      roomId: kok,
    });
    await expense(kokProject, {
      date: '2026-02-01',
      description: 'Montering',
      category: 'arbete',
      amountOre: 400_000,
      roomId: kok,
    });
    await expense(badProject, {
      date: '2026-02-15',
      description: 'ÖVERSKÅP 100% ek',
      store: 'Bauhaus',
      amountOre: 80_000,
      roomId: badrum,
    });
    await expense(badProject, {
      date: '2026-05-20',
      description: 'Rörmokare',
      category: 'arbete',
      store: 'Rör & Vatten',
      amountOre: 50_000,
    });
  });
  afterEach(() => ctx.close());

  describe('GET /expenses', () => {
    it('listar alla utgifter med projekt och rum, senaste först', async () => {
      const res = await get('/api/expenses');
      expect(res.count).toBe(4);
      expect(res.totalOre).toBe(830_000);
      expect(res.items[0]).toMatchObject({
        description: 'Rörmokare',
        projectTitle: 'Badrum',
        roomName: null,
      });
      expect(res.items.at(-1).roomName).toBe('Kök');
    });

    it('söker skiftlägesokänsligt även för å, ä och ö', async () => {
      const res = await get(`/api/expenses?q=${encodeURIComponent('överskåp')}`);
      expect(res.items.map((e: { description: string }) => e.description)).toEqual([
        'ÖVERSKÅP 100% ek',
      ]);
    });

    it('söker i butik och projektnamn, och tolkar % bokstavligt', async () => {
      expect((await get('/api/expenses?q=ikea')).count).toBe(1);
      expect((await get(`/api/expenses?q=${encodeURIComponent('nytt kök')}`)).count).toBe(2);
      expect((await get(`/api/expenses?q=${encodeURIComponent('100%')}`)).count).toBe(1);
      expect((await get(`/api/expenses?q=${encodeURIComponent('%')}`)).count).toBe(1);
    });

    it('filtrerar på datum, kategori, rum och projekt', async () => {
      expect((await get('/api/expenses?from=2026-01-01&to=2026-02-28')).count).toBe(2);
      expect((await get('/api/expenses?category=arbete')).totalOre).toBe(450_000);
      expect((await get(`/api/expenses?roomId=${badrum}`)).count).toBe(1);
      expect((await get(`/api/expenses?projectId=${kokProject}`)).count).toBe(2);
    });

    it('sorterar på belopp', async () => {
      const res = await get('/api/expenses?sort=amount&order=asc');
      expect(res.items.map((e: { amountOre: number }) => e.amountOre)).toEqual([
        50_000, 80_000, 300_000, 400_000,
      ]);
    });

    it('nekar omvänt datumintervall', async () => {
      expect((await req('GET', '/api/expenses?from=2026-05-01&to=2026-01-01')).statusCode).toBe(
        400,
      );
    });
  });

  describe('CSV-export', () => {
    it('ger Excel-vänlig CSV med samma filter', async () => {
      const res = await req('GET', '/api/export/expenses.csv?category=arbete&sort=date&order=asc');
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="utgifter-\d{4}-\d{2}-\d{2}\.csv"/,
      );
      expect(res.body.startsWith('﻿')).toBe(true);
      const lines = res.body.slice(1).trimEnd().split('\r\n');
      expect(lines).toEqual([
        'Datum;Projekt;Rum;Beskrivning;Butik/firma;Kategori;Belopp (kr);Kvitto',
        '2026-02-01;Nytt kök;Kök;Montering;;Arbetskostnad;4000,00;Nej',
        '2026-05-20;Badrum;;Rörmokare;Rör & Vatten;Arbetskostnad;500,00;Nej',
      ]);
    });

    it('citerar och skyddar mot formelinjektion', () => {
      expect(csvCell('Kakel; vit')).toBe('"Kakel; vit"');
      expect(csvCell('Säg "hej"')).toBe('"Säg ""hej"""');
      expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
      expect(csvCell('-5 kr rabatt')).toBe("'-5 kr rabatt");
      expect(csvCell(null)).toBe('');
    });
  });

  describe('GET /stats', () => {
    it('summerar ett år per månad, kategori och rum', async () => {
      const s = await get('/api/stats?year=2026');
      expect(s.years).toEqual([2026, 2024]);
      expect(s.totalOre).toBe(530_000);
      expect(s.expenseCount).toBe(3);
      expect(s.series).toHaveLength(12);
      expect(s.series[1]).toEqual({ label: 'feb', key: '2026-02', amountOre: 480_000 });
      expect(s.series[4].amountOre).toBe(50_000);
      expect(s.byCategory).toEqual([
        { category: 'material', amountOre: 80_000 },
        { category: 'verktyg', amountOre: 0 },
        { category: 'arbete', amountOre: 450_000 },
        { category: 'ovrigt', amountOre: 0 },
      ]);
      expect(s.byRoom).toEqual([
        { roomId: kok, name: 'Kök', amountOre: 400_000 },
        { roomId: badrum, name: 'Badrum', amountOre: 80_000 },
        { roomId: null, name: 'Inget specifikt rum', amountOre: 50_000 },
      ]);
    });

    it('visar budget mot utfall för hela projektet men periodens del separat', async () => {
      const s = await get('/api/stats?year=2026');
      const kokStats = s.projects.find((p: { id: number }) => p.id === kokProject);
      expect(kokStats).toMatchObject({
        budgetOre: 1_000_000,
        spentOre: 700_000,
        spentInPeriodOre: 400_000,
      });
      const bad = s.projects.find((p: { id: number }) => p.id === badProject);
      expect(bad.spentOre).toBeGreaterThan(bad.budgetOre);
    });

    it('ger ROT-underlag per utförare med organisationsnummer', async () => {
      const s = await get('/api/stats?year=2026');
      expect(s.labor).toEqual({
        totalOre: 450_000,
        byContractor: [
          {
            contractorId: expect.any(Number),
            name: 'Snickare AB',
            orgNumber: '556677-8899',
            amountOre: 400_000,
          },
          { contractorId: null, name: 'Rör & Vatten', orgNumber: null, amountOre: 50_000 },
        ],
      });
    });

    it('visar alla år inklusive år utan utgifter', async () => {
      const s = await get('/api/stats');
      expect(s.year).toBeNull();
      expect(s.totalOre).toBe(830_000);
      expect(s.series).toEqual([
        { label: '2024', key: '2024', amountOre: 300_000 },
        { label: '2025', key: '2025', amountOre: 0 },
        { label: '2026', key: '2026', amountOre: 530_000 },
      ]);
    });

    it('fungerar utan data', async () => {
      const empty = createTestApp();
      const s = (await empty.app.inject({ method: 'GET', url: '/api/stats' })).json();
      expect(s).toMatchObject({
        years: [],
        totalOre: 0,
        series: [],
        byRoom: [],
        labor: { totalOre: 0, byContractor: [] },
      });
      await empty.close();
    });
  });

  describe('GET /report', () => {
    it('samlar projekt med utgifter och klara uppgifter', async () => {
      await req('POST', `/api/projects/${kokProject}/tasks`, { title: 'Riv', done: true });
      await req('POST', `/api/projects/${kokProject}/tasks`, { title: 'Måla' });
      const r = await get('/api/report');
      expect(r.totalOre).toBe(830_000);
      expect(r.rooms.map((x: { name: string }) => x.name)).toEqual(['Badrum', 'Kök']);
      const kokReport = r.projects.find((p: { id: number }) => p.id === kokProject);
      expect(kokReport.expenses.map((e: { date: string }) => e.date)).toEqual([
        '2024-03-10',
        '2026-02-01',
      ]);
      expect(kokReport.tasksCompleted.map((t: { title: string }) => t.title)).toEqual(['Riv']);
    });
  });
});
