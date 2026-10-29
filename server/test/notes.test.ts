import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('anteckningar', () => {
  let ctx: TestCtx;
  beforeEach(() => {
    ctx = createTestApp();
  });
  afterEach(() => ctx.close());

  it('kräver projekt eller rum', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { content: 'Hej' },
    });
    expect(res.statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/notes' })).statusCode).toBe(400);
  });

  it('skapar, listar och redigerar anteckningar på ett rum', async () => {
    const room = (
      await ctx.app.inject({ method: 'POST', url: '/api/rooms', payload: { name: 'Kök' } })
    ).json();
    const note = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/notes',
        payload: { roomId: room.id, content: 'Fläkt' },
      })
    ).json();
    const list = (
      await ctx.app.inject({ method: 'GET', url: `/api/notes?roomId=${room.id}` })
    ).json();
    expect(list).toHaveLength(1);

    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { content: 'Ny köksfläkt' },
    });
    expect(patched.json().content).toBe('Ny köksfläkt');
  });
});
