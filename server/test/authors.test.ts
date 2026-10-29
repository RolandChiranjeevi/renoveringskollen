import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.ts';
import { expenses, users } from '../src/db/schema.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('tillagd av', () => {
  let ctx: TestCtx;
  let projectId: number;

  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    (await ctx.app.inject({ method, url, payload })).json();

  /** Lägger till en medlem och returnerar ett anrop som görs som den personen. */
  const addMember = (name: string) => {
    const member = ctx.db
      .insert(users)
      .values({
        name,
        email: `${name.toLowerCase()}@example.test`,
        passwordHash: 'oanvänd',
        role: 'member',
      })
      .returning()
      .get();
    const cookie = `${SESSION_COOKIE}=${createSession(ctx.db, member.id)}`;
    return {
      member,
      asMember: async (method: 'POST' | 'PATCH', url: string, payload: object) =>
        (await ctx.app.inject({ method, url, payload, headers: { cookie } })).json(),
    };
  };

  const expensePayload = {
    date: '2026-05-01',
    description: 'Skruv',
    category: 'material',
    amountOre: 100,
  };

  beforeEach(async () => {
    ctx = createTestApp();
    projectId = (await json('POST', '/api/projects', { title: 'Kök' })).id;
  });
  afterEach(() => ctx.close());

  it('sparar vem som skapade utgift, uppgift och anteckning, men visar inget namn för en ensam användare', async () => {
    const owner = ctx.user!;
    const expense = await json('POST', `/api/projects/${projectId}/expenses`, expensePayload);
    const task = await json('POST', `/api/projects/${projectId}/tasks`, { title: 'Riv' });
    const note = await json('POST', '/api/notes', { projectId, content: 'Hej' });

    for (const row of [expense, task, note]) {
      expect(row).toMatchObject({ createdBy: owner.id, createdByName: null });
    }
    const listed = await json('GET', `/api/projects/${projectId}/expenses`);
    expect(listed[0]).toMatchObject({ createdBy: owner.id, createdByName: null });
  });

  it('visar vem som la till vad så fort hushållet har fler medlemmar', async () => {
    const { member, asMember } = addMember('Erik');

    const expense = await asMember('POST', `/api/projects/${projectId}/expenses`, expensePayload);
    const task = await asMember('POST', `/api/projects/${projectId}/tasks`, { title: 'Måla' });
    const note = await asMember('POST', '/api/notes', { projectId, content: 'Från Erik' });
    expect(expense).toMatchObject({ createdBy: member.id, createdByName: 'Erik' });
    expect(task).toMatchObject({ createdBy: member.id, createdByName: 'Erik' });
    expect(note).toMatchObject({ createdBy: member.id, createdByName: 'Erik' });

    // Ägarens egen post får ägarens namn.
    const own = await json('POST', `/api/projects/${projectId}/tasks`, { title: 'Riv' });
    expect(own.createdByName).toBe('Testägare');

    const tasks: { title: string; createdByName: string }[] = await json(
      'GET',
      `/api/projects/${projectId}/tasks`,
    );
    expect(Object.fromEntries(tasks.map((t) => [t.title, t.createdByName]))).toEqual({
      Måla: 'Erik',
      Riv: 'Testägare',
    });
    expect((await json('GET', `/api/notes?projectId=${projectId}`))[0].createdByName).toBe('Erik');
    expect((await json('GET', `/api/projects/${projectId}/expenses`))[0].createdByName).toBe(
      'Erik',
    );
    const search = await json('GET', '/api/expenses');
    expect(JSON.stringify(search)).toContain('"createdByName":"Erik"');
  });

  it('ändrar inte upphovsperson när någon redigerar', async () => {
    const { member, asMember } = addMember('Erik');
    const expense = await json('POST', `/api/projects/${projectId}/expenses`, expensePayload);
    const edited = await asMember('PATCH', `/api/expenses/${expense.id}`, {
      description: 'Skruv 4 cm',
    });
    expect(edited).toMatchObject({ description: 'Skruv 4 cm', createdBy: ctx.user!.id });
    expect(edited.createdBy).not.toBe(member.id);

    const task = await json('POST', `/api/projects/${projectId}/tasks`, { title: 'Riv' });
    expect((await asMember('PATCH', `/api/tasks/${task.id}`, { done: true })).createdBy).toBe(
      ctx.user!.id,
    );
    const note = await json('POST', '/api/notes', { projectId, content: 'a' });
    expect((await asMember('PATCH', `/api/notes/${note.id}`, { content: 'b' })).createdBy).toBe(
      ctx.user!.id,
    );
  });

  it('klarar att personen tas bort: posten finns kvar utan namn', async () => {
    const { member, asMember } = addMember('Erik');
    const expense = await asMember('POST', `/api/projects/${projectId}/expenses`, expensePayload);
    const res = await ctx.app.inject({ method: 'DELETE', url: `/api/users/${member.id}` });
    expect(res.statusCode).toBe(204);

    const after = await json('GET', `/api/expenses/${expense.id}`);
    expect(after).toMatchObject({ description: 'Skruv', createdBy: null, createdByName: null });
  });

  it('lämnar äldre rader utan upphovsperson utan namn', async () => {
    addMember('Erik');
    // Rad som skapats före E1: ingen created_by.
    const expense = await json('POST', `/api/projects/${projectId}/expenses`, expensePayload);
    ctx.db.update(expenses).set({ createdBy: null }).where(eq(expenses.id, expense.id)).run();
    expect(await json('GET', `/api/expenses/${expense.id}`)).toMatchObject({
      createdBy: null,
      createdByName: null,
    });
  });

  it('kan inte sättas av klienten', async () => {
    const { member } = addMember('Erik');
    const expense = await json('POST', `/api/projects/${projectId}/expenses`, {
      ...expensePayload,
      createdBy: member.id,
    });
    expect(expense.createdBy).toBe(ctx.user!.id);
  });
});
