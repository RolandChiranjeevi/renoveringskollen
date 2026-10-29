import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maintenanceLog } from '../src/db/schema.ts';
import { addDays, addMonths, todayIso } from '../src/http/dates.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('addMonths', () => {
  it.each([
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-05-31', 1, '2026-06-30'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-11-15', 3, '2027-02-15'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2028-02-29', 48, '2032-02-29'],
    ['2026-03-15', 24, '2028-03-15'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-01-10', -2, '2025-11-10'],
  ])('%s + %i månader = %s', (from, months, expected) => {
    expect(addMonths(from, months)).toBe(expected);
  });
});

describe('underhållsplan', () => {
  let ctx: TestCtx;
  const today = todayIso();
  const inDays = (n: number) => addDays(today, n);

  const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url, payload });
  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    (await req(method, url, payload)).json();
  const create = (body: Record<string, unknown>) =>
    json('POST', '/api/maintenance', { intervalMonths: 12, ...body });

  beforeEach(() => {
    ctx = createTestApp();
  });
  afterEach(() => ctx.close());

  describe('skapa och beräkna nästa gång', () => {
    it('räknar nästa gång från när det senast gjordes', async () => {
      const item = await create({
        title: 'Olja altan',
        lastDoneOn: '2026-05-31',
        intervalMonths: 12,
      });
      expect(item).toMatchObject({
        title: 'Olja altan',
        roomId: null,
        roomName: null,
        lastDoneOn: '2026-05-31',
        dueOn: '2027-05-31',
        doneCount: 1,
        intervalMonths: 12,
      });
    });

    it('klämmer månadsskiftet: 31 januari + 1 månad blir sista februari', async () => {
      const item = await create({
        title: 'Månadsjobb',
        lastDoneOn: '2026-01-31',
        intervalMonths: 1,
      });
      expect(item.dueOn).toBe('2026-02-28');
    });

    it('använder "första gången" tills jobbet gjorts, och räknar sedan från den dag det gjordes', async () => {
      const item = await create({
        title: 'Rengör golvbrunn',
        firstDueOn: inDays(20),
        intervalMonths: 6,
      });
      expect(item).toMatchObject({
        lastDoneOn: null,
        dueOn: inDays(20),
        doneCount: 0,
        status: 'soon',
      });

      // Gjordes en vecka sent: nästa gång räknas från då, inte från det ursprungliga datumet.
      const late = inDays(-7);
      const done = await json('POST', `/api/maintenance/${item.id}/done`, { doneOn: late });
      expect(done).toMatchObject({ lastDoneOn: late, dueOn: addMonths(late, 6), doneCount: 1 });
    });

    it('markerar som gjord idag när inget datum anges, och sparar anteckningen', async () => {
      const item = await create({ title: 'Byt filter', firstDueOn: inDays(-3), intervalMonths: 3 });
      expect(item.status).toBe('overdue');

      const res = await req('POST', `/api/maintenance/${item.id}/done`, { note: 'Nytt F7-filter' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        lastDoneOn: today,
        dueOn: addMonths(today, 3),
        status: 'later',
      });
      const [entry] = await json('GET', `/api/maintenance/${item.id}/history`);
      expect(entry).toMatchObject({ doneOn: today, note: 'Nytt F7-filter' });
    });

    it('kopplar jobbet till ett rum, eller hela huset', async () => {
      const room = (await json('POST', '/api/rooms', { name: 'Badrum' })).id;
      const inRoom = await create({
        title: 'Rengör golvbrunn',
        roomId: room,
        lastDoneOn: '2026-01-10',
      });
      const house = await create({ title: 'Sota', lastDoneOn: '2026-01-10' });
      expect(inRoom).toMatchObject({ roomId: room, roomName: 'Badrum' });
      expect(house).toMatchObject({ roomId: null, roomName: null });
    });
  });

  describe('validering', () => {
    it('kräver antingen när det senast gjordes eller när det ska göras första gången', async () => {
      const res = await req('POST', '/api/maintenance', {
        title: 'Utan datum',
        intervalMonths: 12,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details[0].path).toBe('firstDueOn');
    });

    it.each([0, 601, 1.5, -3])('nekar intervallet %s månader', async (intervalMonths) => {
      const res = await req('POST', '/api/maintenance', {
        title: 'Fel',
        intervalMonths,
        firstDueOn: inDays(5),
      });
      expect(res.statusCode, String(intervalMonths)).toBe(400);
      expect(res.json().error.details[0].path).toBe('intervalMonths');
    });

    it('nekar datum i framtiden för sådant som redan ska vara gjort', async () => {
      const created = await req('POST', '/api/maintenance', {
        title: 'Framtid',
        intervalMonths: 12,
        lastDoneOn: inDays(1),
      });
      expect(created.statusCode).toBe(400);
      expect(created.json().error.details[0].path).toBe('lastDoneOn');

      const item = await create({ title: 'Jobb', firstDueOn: inDays(5) });
      const done = await req('POST', `/api/maintenance/${item.id}/done`, { doneOn: inDays(1) });
      expect(done.statusCode).toBe(400);
      expect(done.json().error.details[0].path).toBe('doneOn');
      expect((await json('GET', `/api/maintenance/${item.id}/history`)).length).toBe(0);
    });

    it('nekar okänt rum och okända jobb', async () => {
      const res = await req('POST', '/api/maintenance', {
        title: 'Rum finns inte',
        intervalMonths: 12,
        roomId: 999,
        firstDueOn: inDays(5),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_REFERENCE');

      expect((await req('PATCH', '/api/maintenance/999', { title: 'x' })).statusCode).toBe(404);
      expect((await req('POST', '/api/maintenance/999/done', {})).statusCode).toBe(404);
      expect((await req('GET', '/api/maintenance/999/history')).statusCode).toBe(404);
      expect((await req('DELETE', '/api/maintenance/999')).statusCode).toBe(404);
      expect((await req('DELETE', '/api/maintenance-log/999')).statusCode).toBe(404);
    });
  });

  describe('lista, status och sortering', () => {
    it('delar in i försenat, snart och senare, med det mest akuta först', async () => {
      await create({ title: 'C – om två månader', firstDueOn: inDays(60) });
      await create({ title: 'A – försenat', firstDueOn: inDays(-10) });
      await create({ title: 'B – om en vecka', firstDueOn: inDays(7) });
      await create({ title: 'D – sista dagen i fönstret', firstDueOn: inDays(30) });
      await create({ title: 'E – dag 31', firstDueOn: inDays(31) });

      const list = await json('GET', '/api/maintenance');
      expect(list.map((m: { title: string }) => m.title)).toEqual([
        'A – försenat',
        'B – om en vecka',
        'D – sista dagen i fönstret',
        'E – dag 31',
        'C – om två månader',
      ]);
      expect(list.map((m: { status: string }) => m.status)).toEqual([
        'overdue',
        'soon',
        'soon',
        'later',
        'later',
      ]);
      expect(list.map((m: { daysLeft: number }) => m.daysLeft)).toEqual([-10, 7, 30, 31, 60]);
    });
  });

  describe('historik', () => {
    it('senaste posten styr nästa gång, och en äldre post flyttar den inte bakåt', async () => {
      const item = await create({
        title: 'Olja altan',
        lastDoneOn: '2026-05-01',
        intervalMonths: 12,
      });
      await json('POST', `/api/maintenance/${item.id}/done`, { doneOn: '2026-06-10' });
      // Glömd registrering av en tidigare gång:
      const after = await json('POST', `/api/maintenance/${item.id}/done`, {
        doneOn: '2025-05-02',
      });
      expect(after).toMatchObject({ lastDoneOn: '2026-06-10', dueOn: '2027-06-10', doneCount: 3 });

      const history = await json('GET', `/api/maintenance/${item.id}/history`);
      expect(history.map((h: { doneOn: string }) => h.doneOn)).toEqual([
        '2026-06-10',
        '2026-05-01',
        '2025-05-02',
      ]);
    });

    it('en felaktig post går att ta bort och datumet räknas om, till "första gången" om inget finns kvar', async () => {
      const item = await create({ title: 'Rengör', firstDueOn: inDays(10), intervalMonths: 6 });
      const done = await json('POST', `/api/maintenance/${item.id}/done`, { doneOn: today });
      expect(done.dueOn).toBe(addMonths(today, 6));

      const [entry] = await json('GET', `/api/maintenance/${item.id}/history`);
      expect((await req('DELETE', `/api/maintenance-log/${entry.id}`)).statusCode).toBe(204);

      const list = await json('GET', '/api/maintenance');
      expect(list[0]).toMatchObject({ lastDoneOn: null, dueOn: inDays(10), doneCount: 0 });
    });
  });

  describe('ändra och ta bort', () => {
    it('ändrar rubrik, intervall och rum, och nästa gång räknas om', async () => {
      const room = (await json('POST', '/api/rooms', { name: 'Kök' })).id;
      const item = await create({
        title: 'Gammalt namn',
        lastDoneOn: '2026-01-31',
        intervalMonths: 12,
      });
      const patched = await json('PATCH', `/api/maintenance/${item.id}`, {
        title: 'Rengör fläkt',
        intervalMonths: 6,
        roomId: room,
        notes: 'Fettfilter',
      });
      expect(patched).toMatchObject({
        title: 'Rengör fläkt',
        dueOn: '2026-07-31',
        roomName: 'Kök',
        notes: 'Fettfilter',
      });
      // Tillbaka till hela huset:
      expect(
        (await json('PATCH', `/api/maintenance/${item.id}`, { roomId: null })).roomName,
      ).toBeNull();
    });

    it('jobbet finns kvar utan rum om rummet tas bort, och historiken försvinner med jobbet', async () => {
      const room = (await json('POST', '/api/rooms', { name: 'Garage' })).id;
      const item = await create({ title: 'Smörj porten', roomId: room, lastDoneOn: '2026-02-01' });

      await req('DELETE', `/api/rooms/${room}`);
      const list = await json('GET', '/api/maintenance');
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: item.id, roomId: null, roomName: null });

      expect((await req('DELETE', `/api/maintenance/${item.id}`)).statusCode).toBe(204);
      expect(await json('GET', '/api/maintenance')).toEqual([]);
      expect(ctx.db.select().from(maintenanceLog).all()).toEqual([]);
    });
  });

  describe('Kommande', () => {
    it('tar med försenat och snart förfallande underhåll, men inte det som ligger längre fram', async () => {
      const room = (await json('POST', '/api/rooms', { name: 'Badrum' })).id;
      await create({ title: 'Senare', firstDueOn: inDays(90) });
      await create({ title: 'Snart', roomId: room, firstDueOn: inDays(12) });
      await create({ title: 'Försenat', firstDueOn: inDays(-2) });

      const u = await json('GET', '/api/upcoming');
      expect(u.maintenance).toEqual([
        expect.objectContaining({
          title: 'Försenat',
          roomName: null,
          dueOn: inDays(-2),
          daysLeft: -2,
        }),
        expect.objectContaining({
          title: 'Snart',
          roomName: 'Badrum',
          dueOn: inDays(12),
          daysLeft: 12,
        }),
      ]);
    });

    it('försvinner från Kommande när det markerats som gjort', async () => {
      const item = await create({ title: 'Byt filter', firstDueOn: inDays(-1), intervalMonths: 6 });
      expect((await json('GET', '/api/upcoming')).maintenance).toHaveLength(1);
      await json('POST', `/api/maintenance/${item.id}/done`, {});
      expect((await json('GET', '/api/upcoming')).maintenance).toEqual([]);
    });
  });

  it('kräver inloggning', async () => {
    const anon = createTestApp({ authenticated: false });
    for (const url of ['/api/maintenance', '/api/maintenance/1/history']) {
      expect((await anon.app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
    await anon.close();
  });
});
