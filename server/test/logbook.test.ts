import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, multipartBody, PNG_BYTES, type TestCtx } from './helpers.ts';

describe('husloggbok: material, uppgiftsbudget, utförare och försäljningsunderlag', () => {
  let ctx: TestCtx;
  let room: number;
  let project: number;

  const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url, payload });
  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    (await req(method, url, payload)).json();
  const expense = (projectId: number, e: Record<string, unknown>) =>
    json('POST', `/api/projects/${projectId}/expenses`, {
      date: '2026-03-01',
      category: 'material',
      ...e,
    });

  beforeEach(async () => {
    ctx = createTestApp();
    room = (await json('POST', '/api/rooms', { name: 'Hall' })).id;
    project = (await json('POST', '/api/projects', { title: 'Ny hall', roomIds: [room] })).id;
  });
  afterEach(() => ctx.close());

  describe('material och färger', () => {
    it('sparar färg med märke, kulörkod och glans, sorterat per yta', async () => {
      await json('POST', `/api/rooms/${room}/materials`, {
        surface: 'golv',
        type: 'material',
        name: 'Ekparkett 14 mm',
        brand: 'Kährs',
      });
      const paint = await req('POST', `/api/rooms/${room}/materials`, {
        surface: 'vagg',
        type: 'farg',
        name: 'Väggfärg',
        brand: 'Alcro',
        colorCode: 'NCS S 0502-Y',
        colorHex: '#F2EFE8',
        finish: 'Helmatt 7',
        appliedOn: '2026-03-02',
      });
      expect(paint.statusCode).toBe(201);
      await json('POST', `/api/rooms/${room}/materials`, {
        surface: 'ovrigt',
        type: 'material',
        name: 'Gips + plywood',
      });

      const list = await json('GET', `/api/rooms/${room}/materials`);
      expect(list.map((m: { name: string }) => m.name)).toEqual([
        'Ekparkett 14 mm',
        'Väggfärg',
        'Gips + plywood',
      ]);
      expect(list[1]).toMatchObject({
        brand: 'Alcro',
        colorCode: 'NCS S 0502-Y',
        colorHex: '#F2EFE8',
      });

      const patched = await json('PATCH', `/api/materials/${paint.json().id}`, {
        finish: 'Matt 20',
      });
      expect(patched.finish).toBe('Matt 20');
    });

    it('validerar hex-färg och godtar tomt fält', async () => {
      const bad = await req('POST', `/api/rooms/${room}/materials`, {
        surface: 'vagg',
        type: 'farg',
        name: 'Färg',
        colorHex: 'vit',
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.details[0].path).toBe('colorHex');

      const empty = await json('POST', `/api/rooms/${room}/materials`, {
        surface: 'vagg',
        type: 'farg',
        name: 'Färg',
        colorHex: '',
      });
      expect(empty.colorHex).toBeNull();
    });

    it('behåller materialet men tar bort kopplingen när utgiften raderas, och försvinner med rummet', async () => {
      const e = await expense(project, { description: 'Parkett', amountOre: 100_000 });
      const m = await json('POST', `/api/rooms/${room}/materials`, {
        surface: 'golv',
        type: 'material',
        name: 'Parkett',
        expenseId: e.id,
        projectId: project,
      });
      await req('DELETE', `/api/expenses/${e.id}`);
      const [after] = await json('GET', `/api/rooms/${room}/materials`);
      expect(after).toMatchObject({ id: m.id, expenseId: null, projectId: project });

      await req('DELETE', `/api/rooms/${room}`);
      expect((await req('GET', `/api/rooms/${room}/materials`)).statusCode).toBe(404);
      expect((await req('PATCH', `/api/materials/${m.id}`, { name: 'x' })).statusCode).toBe(404);
    });
  });

  describe('budget och utfall per uppgift', () => {
    it('summerar kopplade utgifter per uppgift', async () => {
      const task = await json('POST', `/api/projects/${project}/tasks`, {
        title: 'Lägg golv',
        budgetOre: 1_500_000,
      });
      await expense(project, { description: 'Parkett', amountOre: 1_249_000, taskId: task.id });
      await expense(project, { description: 'Lister', amountOre: 400_000, taskId: task.id });
      await expense(project, { description: 'Kaffe', amountOre: 5_000 });

      const [t] = await json('GET', `/api/projects/${project}/tasks`);
      expect(t).toMatchObject({ title: 'Lägg golv', budgetOre: 1_500_000, spentOre: 1_649_000 });
    });

    it('går att redigera uppgiftens titel, prioritet, datum och budget', async () => {
      const task = await json('POST', `/api/projects/${project}/tasks`, { title: 'Måla' });
      const patched = await json('PATCH', `/api/tasks/${task.id}`, {
        title: 'Måla väggar',
        priority: 'hog',
        dueDate: '2026-05-01',
        budgetOre: 300_000,
      });
      expect(patched).toMatchObject({
        title: 'Måla väggar',
        priority: 'hog',
        dueDate: '2026-05-01',
        budgetOre: 300_000,
      });
    });

    it('nekar koppling till en uppgift i ett annat projekt', async () => {
      const other = (await json('POST', '/api/projects', { title: 'Annat' })).id;
      const foreign = await json('POST', `/api/projects/${other}/tasks`, { title: 'X' });
      const res = await req('POST', `/api/projects/${project}/expenses`, {
        date: '2026-03-01',
        description: 'Fel',
        category: 'material',
        amountOre: 1,
        taskId: foreign.id,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details).toEqual([
        { path: 'taskId', message: 'Uppgiften hör inte till det här projektet' },
      ]);

      const e = await expense(project, { description: 'Ok', amountOre: 1 });
      const patch = await req('PATCH', `/api/expenses/${e.id}`, { taskId: foreign.id });
      expect(patch.statusCode).toBe(400);
    });

    it('behåller utgiften när uppgiften eller hantverkaren tas bort (ON DELETE SET NULL)', async () => {
      const task = await json('POST', `/api/projects/${project}/tasks`, { title: 'Golv' });
      const c = await json('POST', '/api/contractors', { name: 'Golvfirman' });
      const e = await expense(project, {
        description: 'Läggning',
        category: 'arbete',
        amountOre: 900_000,
        taskId: task.id,
        contractorId: c.id,
      });

      expect((await req('DELETE', `/api/tasks/${task.id}`)).statusCode).toBe(204);
      expect((await req('DELETE', `/api/contractors/${c.id}`)).statusCode).toBe(204);
      expect(await json('GET', `/api/expenses/${e.id}`)).toMatchObject({
        id: e.id,
        taskId: null,
        contractorId: null,
      });
    });
  });

  describe('utförare', () => {
    it('visar hantverkare från arbetskostnader, firma som reserv och tomt vid eget arbete', async () => {
      expect((await json('GET', `/api/projects/${project}`)).performedBy).toEqual([]);

      await expense(project, { description: 'Spik', store: 'Byggmax', amountOre: 1_000 });
      expect((await json('GET', `/api/projects/${project}`)).performedBy).toEqual([]);

      await expense(project, {
        description: 'Elarbete',
        category: 'arbete',
        store: 'Elfirman',
        amountOre: 200_000,
      });
      const c = await json('POST', '/api/contractors', {
        name: 'Snickare AB',
        orgNumber: '556677-8899',
      });
      await expense(project, {
        description: 'Snickeri',
        category: 'arbete',
        contractorId: c.id,
        amountOre: 800_000,
      });
      expect((await json('GET', `/api/projects/${project}`)).performedBy).toEqual([
        'Snickare AB',
        'Elfirman',
      ]);

      const report = await json('GET', '/api/report');
      expect(report.projects[0].performedBy).toEqual(['Snickare AB', 'Elfirman']);

      const stats = await json('GET', '/api/stats?year=2026');
      expect(stats.labor.byContractor).toEqual([
        { contractorId: c.id, name: 'Snickare AB', orgNumber: '556677-8899', amountOre: 800_000 },
        { contractorId: null, name: 'Elfirman', orgNumber: null, amountOre: 200_000 },
      ]);
    });

    it('har projekttyp med förbättring som standard', async () => {
      expect((await json('GET', `/api/projects/${project}`)).kind).toBe('forbattring');
      const patched = await json('PATCH', `/api/projects/${project}`, { kind: 'underhall' });
      expect(patched.kind).toBe('underhall');
      expect(
        (await req('PATCH', `/api/projects/${project}`, { kind: 'semester' })).statusCode,
      ).toBe(400);
    });
  });

  describe('försäljningsunderlag', () => {
    it('sammanställer år, projekttyp, rum, material, hantverkare, garantier och bilder', async () => {
      const c = await json('POST', '/api/contractors', {
        name: 'Snickare AB',
        orgNumber: '556677-8899',
      });
      await json('PATCH', `/api/projects/${project}`, {
        contractorId: c.id,
        warrantyUntil: '2099-01-01',
        startDate: '2025-05-01',
      });
      const maint = (
        await json('POST', '/api/projects', {
          title: 'Olja altan',
          kind: 'underhall',
          warrantyUntil: '2000-01-01',
        })
      ).id;
      await expense(project, {
        date: '2025-05-02',
        description: 'Golv',
        amountOre: 1_000_000,
        roomId: room,
      });
      await expense(project, {
        date: '2025-05-10',
        description: 'Läggning',
        category: 'arbete',
        contractorId: c.id,
        amountOre: 600_000,
        roomId: room,
      });
      await expense(maint, { date: '2026-06-01', description: 'Altanolja', amountOre: 50_000 });
      await json('POST', `/api/rooms/${room}/materials`, {
        surface: 'vagg',
        type: 'farg',
        name: 'Väggfärg',
        brand: 'Alcro',
        colorCode: 'NCS S 0502-Y',
      });
      await ctx.app.inject({
        method: 'POST',
        url: '/api/attachments',
        ...multipartBody(
          { kind: 'efter', projectId: String(project) },
          { name: 'efter.png', content: PNG_BYTES },
        ),
      });

      const s = await json('GET', '/api/sale-report');
      expect(s.totalOre).toBe(1_650_000);
      expect(s.byYear).toEqual([
        {
          year: 2025,
          totalOre: 1_600_000,
          laborOre: 600_000,
          byKind: { forbattring: 1_600_000, underhall: 0, reparation: 0 },
        },
        {
          year: 2026,
          totalOre: 50_000,
          laborOre: 0,
          byKind: { forbattring: 0, underhall: 50_000, reparation: 0 },
        },
      ]);
      expect(s.byRoom[0]).toEqual({ roomId: room, name: 'Hall', amountOre: 1_600_000 });
      expect(s.rooms[0].materials[0]).toMatchObject({ brand: 'Alcro', colorCode: 'NCS S 0502-Y' });
      expect(s.contractors).toEqual([
        expect.objectContaining({
          name: 'Snickare AB',
          orgNumber: '556677-8899',
          projectTitles: ['Ny hall'],
          laborOre: 600_000,
        }),
      ]);
      expect(s.warranties).toEqual([
        expect.objectContaining({ title: 'Ny hall', contractorName: 'Snickare AB', active: true }),
        expect.objectContaining({ title: 'Olja altan', active: false }),
      ]);
      const hall = s.projects.find((p: { id: number }) => p.id === project);
      expect(hall).toMatchObject({
        kind: 'forbattring',
        spentOre: 1_600_000,
        laborOre: 600_000,
        roomNames: ['Hall'],
        performedBy: ['Snickare AB'],
        // En ensam efter-bild utan motsvarande före-bild blir inget par.
        photoPairs: [],
      });
    });

    it('tar med alla före/efter-par per projekt, i uppladdningsordning och med bildtext', async () => {
      const project = (await json('POST', '/api/projects', { title: 'Ny altan' })).id;
      const add = async (kind: string, name: string, caption?: string, mime = 'image/png') => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/attachments',
          ...multipartBody(
            { kind, projectId: String(project) },
            { name, content: PNG_BYTES, type: mime },
          ),
        });
        const a = res.json();
        if (caption) await json('PATCH', `/api/attachments/${a.id}`, { caption });
        return a.id as number;
      };
      const f1 = await add('fore', 'f1.png', 'Gamla altanen');
      const f2 = await add('fore', 'f2.png');
      const f3 = await add('fore', 'f3.png', 'Utan par');
      const e1 = await add('efter', 'e1.png', 'Nya altanen');
      const e2 = await add('efter', 'e2.png', 'Trappan');
      await add('ovrigt', 'o.png', 'Ska inte med');

      const s = await json('GET', '/api/sale-report');
      const altan = s.projects.find((p: { id: number }) => p.id === project);
      expect(altan.photoPairs).toEqual([
        { before: { id: f1, caption: 'Gamla altanen' }, after: { id: e1, caption: 'Nya altanen' } },
        { before: { id: f2, caption: null }, after: { id: e2, caption: 'Trappan' } },
      ]);
      // f3 saknar efter-bild och är inte med.
      expect(JSON.stringify(altan.photoPairs)).not.toContain(`"id":${f3}`);
    });

    it('fungerar utan data', async () => {
      const empty = createTestApp();
      const s = (await empty.app.inject({ method: 'GET', url: '/api/sale-report' })).json();
      expect(s).toMatchObject({
        totalOre: 0,
        byYear: [],
        byRoom: [],
        contractors: [],
        warranties: [],
        projects: [],
      });
      await empty.close();
    });
  });
});
