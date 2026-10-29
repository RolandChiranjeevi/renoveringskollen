import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, daysBetween, todayIso } from '../src/http/dates.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('datumhjälpare', () => {
  it('räknar hela dagar och klarar månads- och årsskiften och skottår', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
    // Sommartidsskiftet ger inga halva dagar.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('använder serverns lokala datum', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('budget per kategori och kommande', () => {
  let ctx: TestCtx;
  let project: number;

  const req = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => ctx.app.inject({ method, url, payload });
  const json = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => (await req(method, url, payload)).json();
  const today = todayIso();
  const inDays = (n: number) => addDays(today, n);
  const task = (projectId: number, title: string, dueDate: string | null, extra: object = {}) =>
    json('POST', `/api/projects/${projectId}/tasks`, { title, dueDate, ...extra });

  beforeEach(async () => {
    ctx = createTestApp();
    project = (await json('POST', '/api/projects', { title: 'Nytt kök', budgetOre: 10_000_000 }))
      .id;
  });
  afterEach(() => ctx.close());

  describe('budget per kategori', () => {
    it('visar alla kategorier, även utan budget, med utfall', async () => {
      await json('POST', `/api/projects/${project}/expenses`, {
        date: '2026-03-01',
        description: 'Skåp',
        category: 'material',
        amountOre: 3_000_000,
      });
      const b = await json('GET', `/api/projects/${project}/budgets`);
      expect(b).toEqual({
        projectBudgetOre: 10_000_000,
        allocatedOre: 0,
        categories: [
          { category: 'material', budgetOre: 0, spentOre: 3_000_000 },
          { category: 'verktyg', budgetOre: 0, spentOre: 0 },
          { category: 'arbete', budgetOre: 0, spentOre: 0 },
          { category: 'ovrigt', budgetOre: 0, spentOre: 0 },
        ],
      });
    });

    it('sparar fördelningen och ersätter den vid nästa sparning', async () => {
      await json('POST', `/api/projects/${project}/expenses`, {
        date: '2026-03-01',
        description: 'Bänkskiva',
        category: 'material',
        amountOre: 4_000_000,
      });
      const first = await json('PUT', `/api/projects/${project}/budgets`, {
        budgets: { material: 6_000_000, arbete: 3_000_000 },
      });
      expect(first.allocatedOre).toBe(9_000_000);
      expect(first.categories.find((c: { category: string }) => c.category === 'material')).toEqual(
        {
          category: 'material',
          budgetOre: 6_000_000,
          spentOre: 4_000_000,
        },
      );

      // Ersätter: arbete utelämnas och nollas, verktyg läggs till, 0 betyder ingen budget.
      const second = await json('PUT', `/api/projects/${project}/budgets`, {
        budgets: { material: 5_000_000, verktyg: 200_000, ovrigt: 0 },
      });
      expect(second.allocatedOre).toBe(5_200_000);
      expect(second.categories.map((c: { budgetOre: number }) => c.budgetOre)).toEqual([
        5_000_000, 200_000, 0, 0,
      ]);
      expect(await json('GET', `/api/projects/${project}/budgets`)).toEqual(second);

      expect(
        (await json('PUT', `/api/projects/${project}/budgets`, { budgets: {} })).allocatedOre,
      ).toBe(0);
    });

    it('totalbudgeten är aldrig lägre än summan av kategorierna: den höjs när fördelningen är större', async () => {
      // Ommålning: totalbudget 1 500 kr, kategorier 1 250 + 750 = 2 000 kr, spenderat 1 629 kr.
      const p = (await json('POST', '/api/projects', { title: 'Ommålning', budgetOre: 150_000 }))
        .id;
      for (const [category, amountOre] of [
        ['material', 97_900],
        ['verktyg', 65_000],
      ] as const) {
        await json('POST', `/api/projects/${p}/expenses`, {
          date: '2026-03-01',
          description: category,
          category,
          amountOre,
        });
      }

      const b = await json('PUT', `/api/projects/${p}/budgets`, {
        budgets: { material: 125_000, verktyg: 75_000 },
      });
      expect(b).toMatchObject({ projectBudgetOre: 200_000, allocatedOre: 200_000 });
      // Projektet, och därmed rutan överst, visar samma totalbudget: 2 000 kr, 371 kr kvar.
      expect(await json('GET', `/api/projects/${p}`)).toMatchObject({
        budgetOre: 200_000,
        spentOre: 162_900,
      });
    });

    it('en projekt utan egen totalbudget får summan av kategorierna som budget', async () => {
      const p = (await json('POST', '/api/projects', { title: 'Utan total' })).id;
      const b = await json('PUT', `/api/projects/${p}/budgets`, {
        budgets: { material: 150_000, verktyg: 50_000 },
      });
      expect(b).toMatchObject({ projectBudgetOre: 200_000, allocatedOre: 200_000 });
    });

    it('en delfördelning sänker aldrig totalbudgeten – resten är ofördelat', async () => {
      const b = await json('PUT', `/api/projects/${project}/budgets`, {
        budgets: { material: 3_000_000 },
      });
      expect(b).toMatchObject({ projectBudgetOre: 10_000_000, allocatedOre: 3_000_000 });
      // Inte heller när fördelningen minskas senare.
      const smaller = await json('PUT', `/api/projects/${project}/budgets`, {
        budgets: { material: 1_000_000 },
      });
      expect(smaller.projectBudgetOre).toBe(10_000_000);
    });

    it('nekar att sätta projektets budget lägre än det som fördelats på kategorier', async () => {
      await json('PUT', `/api/projects/${project}/budgets`, {
        budgets: { material: 6_000_000, arbete: 3_000_000 },
      });

      const tooLow = await req('PATCH', `/api/projects/${project}`, { budgetOre: 8_000_000 });
      expect(tooLow.statusCode).toBe(400);
      expect(tooLow.json().error.details).toEqual([
        {
          path: 'budgetOre',
          message: expect.stringMatching(
            /lägre än det som fördelats på kategorier \(90\s000,00\skr\)/,
          ),
        },
      ]);

      // Exakt summan och högre går bra, liksom ändringar som inte rör budgeten.
      expect(
        (await json('PATCH', `/api/projects/${project}`, { budgetOre: 9_000_000 })).budgetOre,
      ).toBe(9_000_000);
      expect((await json('PATCH', `/api/projects/${project}`, { title: 'Nytt namn' })).title).toBe(
        'Nytt namn',
      );

      // Efter att kategorierna sänkts går det att sänka totalbudgeten.
      await json('PUT', `/api/projects/${project}/budgets`, { budgets: { material: 1_000_000 } });
      expect(
        (await json('PATCH', `/api/projects/${project}`, { budgetOre: 2_000_000 })).budgetOre,
      ).toBe(2_000_000);
    });

    it('nekar okänd kategori, negativa och decimala belopp', async () => {
      for (const budgets of [{ mat: 100 }, { material: -1 }, { material: 10.5 }]) {
        const res = await req('PUT', `/api/projects/${project}/budgets`, { budgets });
        expect(res.statusCode, JSON.stringify(budgets)).toBe(400);
      }
      expect((await req('PUT', `/api/projects/${project}/budgets`, {})).statusCode).toBe(400);
    });

    it('ger 404 för projekt som inte finns och tas bort tillsammans med projektet', async () => {
      expect((await req('GET', '/api/projects/999/budgets')).statusCode).toBe(404);
      expect((await req('PUT', '/api/projects/999/budgets', { budgets: {} })).statusCode).toBe(404);

      await json('PUT', `/api/projects/${project}/budgets`, { budgets: { material: 100 } });
      await req('DELETE', `/api/projects/${project}`);
      expect((await req('GET', `/api/projects/${project}/budgets`)).statusCode).toBe(404);
    });
  });

  describe('kommande', () => {
    it('visar försenade och snart förfallande uppgifter, äldst först, och utelämnar resten', async () => {
      await task(project, 'Försenad', inDays(-3), { priority: 'hog' });
      await task(project, 'Idag', inDays(0));
      await task(project, 'Nästa vecka', inDays(7), { priority: 'lag' });
      await task(project, 'Sista dagen i fönstret', inDays(30));
      await task(project, 'För långt fram', inDays(31));
      await task(project, 'Utan datum', null);
      const done = await task(project, 'Redan klar', inDays(-10));
      await json('PATCH', `/api/tasks/${done.id}`, { done: true });

      const u = await json('GET', '/api/upcoming');
      expect(u.today).toBe(today);
      expect(u.tasks.map((t: { title: string }) => t.title)).toEqual([
        'Försenad',
        'Idag',
        'Nästa vecka',
        'Sista dagen i fönstret',
      ]);
      expect(u.tasks.map((t: { daysLeft: number }) => t.daysLeft)).toEqual([-3, 0, 7, 30]);
      expect(u.tasks[0]).toMatchObject({
        projectId: project,
        projectTitle: 'Nytt kök',
        priority: 'hog',
        dueDate: inDays(-3),
      });
    });

    it('visar garantier som löper ut inom 90 dagar – inte utgångna och inte längre fram', async () => {
      const snabbt = (
        await json('POST', '/api/projects', { title: 'Altan', warrantyUntil: inDays(45) })
      ).id;
      await json('POST', '/api/projects', { title: 'Sista dagen', warrantyUntil: inDays(90) });
      await json('POST', '/api/projects', { title: 'Idag', warrantyUntil: today });
      await json('POST', '/api/projects', { title: 'För långt fram', warrantyUntil: inDays(91) });
      await json('POST', '/api/projects', { title: 'Utgången', warrantyUntil: inDays(-1) });
      await json('POST', '/api/projects', { title: 'Ingen garanti' });

      const c = await json('POST', '/api/contractors', { name: 'Snickare AB' });
      await json('PATCH', `/api/projects/${snabbt}`, { contractorId: c.id });

      const u = await json('GET', '/api/upcoming');
      expect(u.warranties.map((w: { title: string }) => w.title)).toEqual([
        'Idag',
        'Altan',
        'Sista dagen',
      ]);
      expect(u.warranties.map((w: { daysLeft: number }) => w.daysLeft)).toEqual([0, 45, 90]);
      expect(u.warranties[1]).toMatchObject({
        projectId: snabbt,
        warrantyUntil: inDays(45),
        contractorName: 'Snickare AB',
      });
      expect(u.warranties[0].contractorName).toBeNull();
    });

    it('är tomt när inget är på gång', async () => {
      const u = await json('GET', '/api/upcoming');
      expect(u).toEqual({ today, tasks: [], warranties: [], maintenance: [] });
    });

    it('kräver inloggning', async () => {
      const anon = createTestApp({ authenticated: false });
      expect((await anon.app.inject({ method: 'GET', url: '/api/upcoming' })).statusCode).toBe(401);
      expect(
        (await anon.app.inject({ method: 'GET', url: '/api/projects/1/budgets' })).statusCode,
      ).toBe(401);
      await anon.close();
    });
  });
});
