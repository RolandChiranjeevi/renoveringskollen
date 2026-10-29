import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('rum och mått', () => {
  let ctx: TestCtx;
  beforeEach(() => {
    ctx = createTestApp();
  });
  afterEach(() => ctx.close());

  const post = (url: string, payload: object) => ctx.app.inject({ method: 'POST', url, payload });

  it('skapar, listar, uppdaterar och tar bort ett rum', async () => {
    const created = await post('/api/rooms', { name: '  Kök ', areaM2: 20, description: '' });
    expect(created.statusCode).toBe(201);
    const room = created.json();
    expect(room).toMatchObject({ name: 'Kök', areaM2: 20, description: null });

    const list = await ctx.app.inject({ method: 'GET', url: '/api/rooms' });
    expect(list.json()).toEqual([expect.objectContaining({ id: room.id, spentOre: 0 })]);

    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/rooms/${room.id}`,
      payload: { floor: 'Plan 1' },
    });
    expect(patched.json()).toMatchObject({ name: 'Kök', floor: 'Plan 1' });

    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/rooms/${room.id}` });
    expect(del.statusCode).toBe(204);
    const gone = await ctx.app.inject({ method: 'GET', url: `/api/rooms/${room.id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.message).toBe('Rummet hittades inte');
  });

  it('validerar indata med fältfel', async () => {
    const res = await post('/api/rooms', { name: '', areaM2: -5 });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map((d: { path: string }) => d.path).sort()).toEqual(['areaM2', 'name']);
  });

  it('ger 409 vid dubbla rumsnamn', async () => {
    await post('/api/rooms', { name: 'Badrum' });
    const res = await post('/api/rooms', { name: 'Badrum' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('ger 400 för ogiltigt id', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/rooms/abc' });
    expect(res.statusCode).toBe(400);
  });

  it('hanterar mått för ett rum', async () => {
    const room = (await post('/api/rooms', { name: 'Hall' })).json();
    const m = await post(`/api/rooms/${room.id}/measurements`, {
      label: 'Golvyta',
      value: 8.5,
      unit: 'm²',
    });
    expect(m.statusCode).toBe(201);

    const detail = (await ctx.app.inject({ method: 'GET', url: `/api/rooms/${room.id}` })).json();
    expect(detail.measurements).toEqual([
      expect.objectContaining({ label: 'Golvyta', value: 8.5 }),
    ]);

    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/measurements/${m.json().id}`,
      payload: { value: 9 },
    });
    expect(patched.json().value).toBe(9);

    expect(
      (await post('/api/rooms/999/measurements', { label: 'X', value: 1, unit: 'm' })).statusCode,
    ).toBe(404);
  });
});
