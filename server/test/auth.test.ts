import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '@reno/shared';
import { SESSION_COOKIE } from '../src/auth/sessions.ts';
import { invites, sessions, users } from '../src/db/schema.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

const OWNER = { name: 'Anna', email: 'Anna@Example.se', password: 'en lång lösenfras' };

describe('inloggning och behörighet', () => {
  let ctx: TestCtx;
  beforeEach(() => {
    ctx = createTestApp({ authenticated: false });
  });
  afterEach(() => ctx.close());

  type Opts = { cookie?: string; csrf?: boolean; ip?: string };
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, o: Opts = {}) =>
    ctx.app.inject({
      method,
      url,
      payload,
      remoteAddress: o.ip ?? '127.0.0.1',
      headers: {
        ...(o.csrf === false ? {} : { [CSRF_HEADER]: '1' }),
        ...(o.cookie ? { cookie: o.cookie } : {}),
      },
    });
  /** Plockar ut sessionscookien ur ett svar, som "namn=värde". */
  const sessionCookie = (res: { cookies: { name: string; value: string }[] }) => {
    const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
    return c ? `${c.name}=${c.value}` : undefined;
  };
  const setupOwner = async () => sessionCookie(await call('POST', '/api/auth/setup', OWNER))!;
  const login = async (password = OWNER.password) =>
    sessionCookie(await call('POST', '/api/auth/login', { email: OWNER.email, password }))!;
  const invite = async (owner: string) =>
    (await call('POST', '/api/invites', { note: 'Till Erik' }, { cookie: owner })).json()
      .token as string;
  const acceptInvite = (token: string, email = 'erik@example.se') =>
    call('POST', '/api/auth/accept-invite', {
      token,
      name: 'Erik',
      email,
      password: 'eriks långa lösenord',
    });

  it('skyddar all data – utan session blir svaret 401', async () => {
    for (const url of [
      '/api/rooms',
      '/api/projects',
      '/api/expenses',
      '/api/stats',
      '/api/report',
      '/api/attachments/1/file',
    ]) {
      const res = await call('GET', url);
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
    expect((await call('GET', '/api/health')).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/status')).json()).toEqual({
      setupRequired: true,
      user: null,
    });
  });

  describe('första start', () => {
    it('skapar ägaren, loggar in med säker cookie och går bara att göra en gång', async () => {
      const res = await call('POST', '/api/auth/setup', OWNER);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: 'Anna', email: 'anna@example.se', role: 'owner' });
      expect(res.json()).not.toHaveProperty('passwordHash');

      const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

      const status = await call('GET', '/api/auth/status', undefined, {
        cookie: sessionCookie(res),
      });
      expect(status.json()).toMatchObject({ setupRequired: false, user: { name: 'Anna' } });
      expect(
        (await call('GET', '/api/rooms', undefined, { cookie: sessionCookie(res) })).statusCode,
      ).toBe(200);

      const again = await call('POST', '/api/auth/setup', { ...OWNER, email: 'ny@example.se' });
      expect(again.statusCode).toBe(409);
    });

    it('måste göras från servern själv', async () => {
      for (const url of ['/api/auth/setup', '/api/auth/setup?x=1']) {
        const res = await call('POST', url, OWNER, { ip: '192.168.1.20' });
        expect(res.statusCode, url).toBe(403);
        expect(res.json().error.code).toBe('SETUP_LOCAL_ONLY');
      }
      expect(ctx.db.select().from(users).all()).toHaveLength(0);
    });

    it('kräver tillräckligt långt lösenord och lagrar bara en argon2-hash', async () => {
      const short = await call('POST', '/api/auth/setup', { ...OWNER, password: 'kort' });
      expect(short.statusCode).toBe(400);
      await setupOwner();
      const [row] = ctx.db.select().from(users).all();
      expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row!.passwordHash).not.toContain(OWNER.password);
    });
  });

  it('kräver CSRF-rubrik på ändrande anrop, även med giltig session', async () => {
    const cookie = await setupOwner();
    const res = await call('POST', '/api/rooms', { name: 'Kök' }, { cookie, csrf: false });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF');
    expect((await call('POST', '/api/rooms', { name: 'Kök' }, { cookie })).statusCode).toBe(201);
  });

  describe('inloggning', () => {
    beforeEach(async () => {
      await setupOwner();
    });

    it('loggar in oavsett skiftläge i e-postadressen', async () => {
      const res = await call('POST', '/api/auth/login', {
        email: 'ANNA@example.SE',
        password: OWNER.password,
      });
      expect(res.statusCode).toBe(200);
      const me = await call('GET', '/api/auth/me', undefined, { cookie: sessionCookie(res) });
      expect(me.json().name).toBe('Anna');
    });

    it('ger samma svar för fel lösenord och okänd e-post', async () => {
      const wrong = await call('POST', '/api/auth/login', {
        email: OWNER.email,
        password: 'fel lösenord',
      });
      const unknown = await call('POST', '/api/auth/login', {
        email: 'okand@example.se',
        password: 'fel lösenord',
      });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
      expect(sessionCookie(wrong)).toBeUndefined();
    });

    it('spärrar efter fem misslyckade försök – även rätt lösenord', async () => {
      for (let i = 0; i < 5; i++) {
        await call('POST', '/api/auth/login', { email: OWNER.email, password: `fel ${i}` });
      }
      const blocked = await call('POST', '/api/auth/login', {
        email: OWNER.email,
        password: OWNER.password,
      });
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.json().error.message).toMatch(/Försök igen om \d+ min/);
    });

    it('utloggning gör sessionen ogiltig', async () => {
      const cookie = await login();
      expect((await call('POST', '/api/auth/logout', undefined, { cookie })).statusCode).toBe(204);
      expect((await call('GET', '/api/rooms', undefined, { cookie })).statusCode).toBe(401);
    });

    it('sparar bara en hash av sessionstoken', async () => {
      const token = (await login()).split('=')[1]!;
      const ids = ctx.db
        .select({ id: sessions.id })
        .from(sessions)
        .all()
        .map((s) => s.id);
      expect(ids).not.toContain(token);
      expect(ids.every((id) => /^[0-9a-f]{64}$/.test(id))).toBe(true);
    });

    it('godtar inte en utgången session', async () => {
      const cookie = await login();
      ctx.db.update(sessions).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
      expect((await call('GET', '/api/rooms', undefined, { cookie })).statusCode).toBe(401);
    });
  });

  it('lösenordsbyte kräver nuvarande lösenord och loggar ut andra enheter', async () => {
    const laptop = await setupOwner();
    const phone = await login();

    const wrong = await call(
      'POST',
      '/api/auth/password',
      { currentPassword: 'fel', newPassword: 'ett nytt långt lösenord' },
      { cookie: laptop },
    );
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.details).toEqual([
      { path: 'currentPassword', message: 'Fel lösenord' },
    ]);

    const ok = await call(
      'POST',
      '/api/auth/password',
      { currentPassword: OWNER.password, newPassword: 'ett nytt långt lösenord' },
      { cookie: laptop },
    );
    expect(ok.statusCode).toBe(204);
    expect((await call('GET', '/api/rooms', undefined, { cookie: laptop })).statusCode).toBe(200);
    expect((await call('GET', '/api/rooms', undefined, { cookie: phone })).statusCode).toBe(401);

    const old = await call('POST', '/api/auth/login', {
      email: OWNER.email,
      password: OWNER.password,
    });
    expect(old.statusCode).toBe(401);
  });

  describe('inbjudningar', () => {
    it('bjuder in en medlem som delar hushållets data men inte kan bjuda in', async () => {
      const owner = await setupOwner();
      await call('POST', '/api/rooms', { name: 'Kök' }, { cookie: owner });
      const token = await invite(owner);
      expect((await call('GET', `/api/auth/invites/${token}`)).json()).toEqual({ valid: true });

      const accepted = await acceptInvite(token);
      expect(accepted.statusCode).toBe(201);
      expect(accepted.json()).toMatchObject({ name: 'Erik', role: 'member' });
      const member = sessionCookie(accepted)!;

      const rooms = await call('GET', '/api/rooms', undefined, { cookie: member });
      expect(rooms.json().map((r: { name: string }) => r.name)).toEqual(['Kök']);
      expect((await call('POST', '/api/invites', {}, { cookie: member })).statusCode).toBe(403);
      expect((await call('GET', '/api/users', undefined, { cookie: member })).statusCode).toBe(403);

      const list = (await call('GET', '/api/invites', undefined, { cookie: owner })).json();
      expect(list[0]).toMatchObject({ note: 'Till Erik', usedByName: 'Erik' });
      expect(list[0]).not.toHaveProperty('token');
      expect(list[0]).not.toHaveProperty('tokenHash');
    });

    it('en inbjudan går bara att använda en gång', async () => {
      const token = await invite(await setupOwner());
      expect((await acceptInvite(token)).statusCode).toBe(201);
      const reuse = await acceptInvite(token, 'annan@example.se');
      expect(reuse.statusCode).toBe(400);
      expect(reuse.json().error.code).toBe('INVALID_INVITE');
      expect((await call('GET', `/api/auth/invites/${token}`)).json()).toEqual({ valid: false });
    });

    it('nekar upptagen e-postadress utan att förbruka inbjudan', async () => {
      const owner = await setupOwner();
      const fresh = await invite(owner);
      const taken = await acceptInvite(fresh, OWNER.email);
      expect(taken.statusCode).toBe(409);
      expect(taken.json().error.code).toBe('EMAIL_TAKEN');
      // Inbjudan förbrukades inte av det misslyckade försöket.
      expect((await acceptInvite(fresh)).statusCode).toBe(201);
    });

    it('nekar en inbjudan som gått ut', async () => {
      const token = await invite(await setupOwner());
      ctx.db.update(invites).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
      const res = await acceptInvite(token);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_INVITE');
    });

    it('ägaren kan ta bort en medlem, som då loggas ut direkt', async () => {
      const owner = await setupOwner();
      const accepted = await acceptInvite(await invite(owner));
      const member = sessionCookie(accepted)!;

      const self = ctx.db.select().from(users).where(eq(users.role, 'owner')).get()!;
      expect(
        (await call('DELETE', `/api/users/${self.id}`, undefined, { cookie: owner })).statusCode,
      ).toBe(400);

      const removed = await call('DELETE', `/api/users/${accepted.json().id}`, undefined, {
        cookie: owner,
      });
      expect(removed.statusCode).toBe(204);
      expect((await call('GET', '/api/rooms', undefined, { cookie: member })).statusCode).toBe(401);
    });
  });
});
