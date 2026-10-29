import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('offerter', () => {
  let ctx: TestCtx;
  let projectId: number;

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
  const addQuote = (payload: object, project = projectId) =>
    json('POST', `/api/projects/${project}/quotes`, payload);
  const project = () => json('GET', `/api/projects/${projectId}`);

  beforeEach(async () => {
    ctx = createTestApp();
    projectId = (await json('POST', '/api/projects', { title: 'Nytt badrum' })).id;
  });
  afterEach(() => ctx.close());

  describe('skapa och lista', () => {
    it('sparar en offert från en sparad hantverkare eller bara ett namn, billigast först', async () => {
      const contractor = await json('POST', '/api/contractors', { name: 'Bygg AB' });
      const dyr = await addQuote({
        contractorId: contractor.id,
        amountOre: 9_500_000,
        description: 'Allt inklusive material',
        receivedOn: '2026-09-01',
        validUntil: '2026-12-01',
      });
      const billig = await addQuote({ supplierName: 'Måleri Olsson', amountOre: 8_000_000 });

      expect(dyr).toMatchObject({
        projectId,
        supplier: 'Bygg AB',
        contractorId: contractor.id,
        amountOre: 9_500_000,
        validUntil: '2026-12-01',
        chosen: false,
      });
      expect(billig).toMatchObject({ supplier: 'Måleri Olsson', contractorId: null });

      const list = await json('GET', `/api/projects/${projectId}/quotes`);
      expect(list.map((q: { supplier: string }) => q.supplier)).toEqual([
        'Måleri Olsson',
        'Bygg AB',
      ]);
    });

    it('kräver avsändare och belopp, och nekar okända hantverkare och projekt', async () => {
      const none = await req('POST', `/api/projects/${projectId}/quotes`, { amountOre: 100 });
      expect(none.statusCode).toBe(400);
      expect(none.json().error.details).toEqual([
        { path: 'supplierName', message: 'Ange vem offerten kommer från' },
      ]);
      expect(
        (await req('POST', `/api/projects/${projectId}/quotes`, { supplierName: 'X' })).statusCode,
      ).toBe(400);
      expect(
        (
          await req('POST', `/api/projects/${projectId}/quotes`, {
            supplierName: 'X',
            amountOre: -1,
          })
        ).statusCode,
      ).toBe(400);
      const unknown = await req('POST', `/api/projects/${projectId}/quotes`, {
        contractorId: 999,
        amountOre: 100,
      });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error.details[0].path).toBe('contractorId');
      expect(
        (await req('POST', '/api/projects/999/quotes', { supplierName: 'X', amountOre: 1 }))
          .statusCode,
      ).toBe(404);
      expect((await req('GET', '/api/projects/999/quotes')).statusCode).toBe(404);
    });
  });

  describe('ändra och ta bort', () => {
    it('ändrar belopp men kräver fortfarande en avsändare', async () => {
      const q = await addQuote({ supplierName: 'Måleri Olsson', amountOre: 8_000_000 });
      const edited = await json('PATCH', `/api/quotes/${q.id}`, { amountOre: 7_500_000 });
      expect(edited).toMatchObject({ amountOre: 7_500_000, supplier: 'Måleri Olsson' });

      const cleared = await req('PATCH', `/api/quotes/${q.id}`, { supplierName: '' });
      expect(cleared.statusCode).toBe(400);
      expect((await req('PATCH', `/api/quotes/${q.id}`, {})).statusCode).toBe(400);
      expect((await req('PATCH', '/api/quotes/999', { amountOre: 1 })).statusCode).toBe(404);
    });

    it('tas bort med projektet, men inte när en hantverkare tas bort: namnet finns kvar', async () => {
      const c = await json('POST', '/api/contractors', { name: 'Bygg AB' });
      const q = await addQuote({ contractorId: c.id, amountOre: 100 });
      expect((await req('DELETE', `/api/contractors/${c.id}`)).statusCode).toBe(204);
      const after = (await json('GET', `/api/projects/${projectId}/quotes`))[0];
      expect(after).toMatchObject({ id: q.id, contractorId: null, supplier: 'Bygg AB' });

      expect((await req('DELETE', `/api/quotes/${q.id}`)).statusCode).toBe(204);
      expect((await req('DELETE', `/api/quotes/${q.id}`)).statusCode).toBe(404);

      await addQuote({ supplierName: 'Annan', amountOre: 1 });
      await req('DELETE', `/api/projects/${projectId}`);
      expect((await req('GET', `/api/projects/${projectId}/quotes`)).statusCode).toBe(404);
    });
  });

  describe('välj offert', () => {
    it('sätter projektets hantverkare och budget efter offerten', async () => {
      const c = await json('POST', '/api/contractors', { name: 'Bygg AB' });
      const q = await addQuote({ contractorId: c.id, amountOre: 9_500_000 });
      const chosen = await json('POST', `/api/quotes/${q.id}/choose`);
      expect(chosen).toMatchObject({ id: q.id, chosen: true });
      expect(await project()).toMatchObject({
        budgetOre: 9_500_000,
        contractorId: c.id,
      });
    });

    it('skapar en hantverkare av namnet, och återanvänder en som redan finns', async () => {
      const q = await addQuote({ supplierName: 'Måleri Olsson', amountOre: 100 });
      const chosen = await json('POST', `/api/quotes/${q.id}/choose`);
      expect(chosen.contractorId).toEqual(expect.any(Number));
      const contractors = await json('GET', '/api/contractors');
      expect(contractors.map((x: { name: string }) => x.name)).toEqual(['Måleri Olsson']);
      expect((await project()).contractorId).toBe(chosen.contractorId);

      // En ny offert med samma namn (annan skrivning av versaler) hamnar på samma hantverkare.
      const second = await addQuote({ supplierName: 'MÅLERI OLSSON', amountOre: 200 });
      const again = await json('POST', `/api/quotes/${second.id}/choose`);
      expect(again.contractorId).toBe(chosen.contractorId);
      expect(await json('GET', '/api/contractors')).toHaveLength(1);
    });

    it('byter vald offert: bara en är vald åt gången och projektet följer den nya', async () => {
      const a = await addQuote({ supplierName: 'A', amountOre: 1_000_000 });
      const b = await addQuote({ supplierName: 'B', amountOre: 2_000_000 });
      await json('POST', `/api/quotes/${a.id}/choose`);
      await json('POST', `/api/quotes/${b.id}/choose`);

      const list: { supplier: string; chosen: boolean }[] = await json(
        'GET',
        `/api/projects/${projectId}/quotes`,
      );
      expect(list.map((q) => [q.supplier, q.chosen])).toEqual([
        ['A', false],
        ['B', true],
      ]);
      expect((await project()).budgetOre).toBe(2_000_000);
    });

    it('ångra val tar bara bort markeringen och lämnar projektet som det är', async () => {
      const q = await addQuote({ supplierName: 'A', amountOre: 1_000_000 });
      await json('POST', `/api/quotes/${q.id}/choose`);
      const undone = await json('POST', `/api/quotes/${q.id}/unchoose`);
      expect(undone.chosen).toBe(false);
      expect((await project()).budgetOre).toBe(1_000_000);
    });

    it('nekar en offert som är lägre än det som fördelats på kategorier, och ändrar inget', async () => {
      await json('PUT', `/api/projects/${projectId}/budgets`, {
        budgets: { material: 600_000, arbete: 400_000 },
      });
      const low = await addQuote({ supplierName: 'Billig', amountOre: 900_000 });
      const res = await req('POST', `/api/quotes/${low.id}/choose`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details[0]).toMatchObject({
        path: 'amountOre',
        message: expect.stringMatching(/lägre än det som fördelats på kategorier/),
      });
      expect(await json('GET', '/api/contractors')).toEqual([]);
      expect((await json('GET', `/api/projects/${projectId}/quotes`))[0].chosen).toBe(false);
      expect((await project()).budgetOre).toBe(1_000_000);

      // Exakt summan går bra.
      const exact = await addQuote({ supplierName: 'Exakt', amountOre: 1_000_000 });
      expect((await req('POST', `/api/quotes/${exact.id}/choose`)).statusCode).toBe(200);
    });

    it('ger 404 för okända offerter', async () => {
      expect((await req('POST', '/api/quotes/999/choose')).statusCode).toBe(404);
      expect((await req('POST', '/api/quotes/999/unchoose')).statusCode).toBe(404);
    });
  });

  it('kräver inloggning', async () => {
    const anon = createTestApp({ authenticated: false });
    const res = await anon.app.inject({ method: 'GET', url: '/api/projects/1/quotes' });
    expect(res.statusCode).toBe(401);
    await anon.close();
  });
});
