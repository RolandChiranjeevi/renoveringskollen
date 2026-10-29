import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  acceptInviteSchema,
  changePasswordSchema,
  idParamSchema,
  inviteCreateSchema,
  loginSchema,
  setupSchema,
  type AuthStatus,
  type CreatedInvite,
  type Invite,
  type User,
} from '@reno/shared';
import { clearSessionCookie, setSessionCookie, type CookieSettings } from '../auth/cookies.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import type { FailureLimiter } from '../auth/rateLimit.ts';
import { requireOwner } from '../auth/requireUser.ts';
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  hashToken,
  lookupSession,
  newToken,
  purgeExpiredSessions,
  SESSION_COOKIE,
  toPublicUser,
} from '../auth/sessions.ts';
import { invites, users } from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { nowIso } from '../http/now.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

export interface AuthDeps extends RouteDeps {
  cookies: CookieSettings;
  limiters: { byIp: FailureLimiter; byEmail: FailureLimiter };
}

const INVITE_DAYS = 7;
const emailTaken = () => new HttpError(409, 'EMAIL_TAKEN', 'E-postadressen används redan');
const invalidInvite = () =>
  new HttpError(400, 'INVALID_INVITE', 'Inbjudan är ogiltig, har gått ut eller har redan använts');

/** Routes som fungerar utan inloggning: status, första start, inloggning, inbjudan och utloggning. */
export const publicAuthRoutes =
  ({ db, cookies, limiters }: AuthDeps): FastifyPluginAsync =>
  async (app) => {
    const countUsers = () =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .get()!.n;

    app.get('/auth/status', async (req): Promise<AuthStatus> => {
      const session = lookupSession(db, req.cookies[SESSION_COOKIE]);
      return { setupRequired: countUsers() === 0, user: session?.user ?? null };
    });

    // Första start: skapar ägarkontot. Fungerar bara så länge det inte finns några användare.
    app.post('/auth/setup', async (req, reply): Promise<User> => {
      const data = parse(setupSchema, req.body);
      const passwordHash = await hashPassword(data.password);
      const user = db.transaction((tx) => {
        if (
          tx
            .select({ n: sql<number>`count(*)` })
            .from(users)
            .get()!.n > 0
        ) {
          throw new HttpError(
            409,
            'ALREADY_SET_UP',
            'Appen är redan konfigurerad – logga in i stället',
          );
        }
        return tx
          .insert(users)
          .values({ name: data.name, email: data.email, passwordHash, role: 'owner' })
          .returning()
          .get();
      });
      setSessionCookie(reply, createSession(db, user.id, req.headers['user-agent']), cookies);
      reply.status(201);
      return toPublicUser(user);
    });

    app.post('/auth/login', async (req, reply): Promise<User> => {
      const { email, password } = parse(loginSchema, req.body);
      const keys = { ip: `ip:${req.ip}`, email: `email:${email}` };
      const wait = Math.max(
        limiters.byIp.blockedFor(keys.ip),
        limiters.byEmail.blockedFor(keys.email),
      );
      if (wait > 0) {
        reply.header('Retry-After', String(wait));
        throw new HttpError(
          429,
          'TOO_MANY_ATTEMPTS',
          `För många misslyckade försök. Försök igen om ${Math.ceil(wait / 60)} min.`,
        );
      }

      const user = db.select().from(users).where(eq(users.email, email)).get();
      const ok = await verifyPassword(user?.passwordHash, password);
      if (!ok || !user) {
        limiters.byIp.fail(keys.ip);
        limiters.byEmail.fail(keys.email);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Fel e-postadress eller lösenord');
      }
      limiters.byEmail.reset(keys.email);
      purgeExpiredSessions(db);
      setSessionCookie(reply, createSession(db, user.id, req.headers['user-agent']), cookies);
      return toPublicUser(user);
    });

    app.post('/auth/logout', async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      if (token) deleteSession(db, token);
      clearSessionCookie(reply, cookies);
      reply.status(204);
    });

    const openInvite = (token: string) =>
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, nowIso()),
      );

    // Låter sidan för inbjudan visa om länken fortfarande gäller.
    app.get('/auth/invites/:token', async (req) => {
      const { token } = req.params as { token: string };
      const valid =
        token.length >= 20 &&
        token.length <= 200 &&
        !!db.select({ id: invites.id }).from(invites).where(openInvite(token)).get();
      return { valid };
    });

    app.post('/auth/accept-invite', async (req, reply): Promise<User> => {
      const data = parse(acceptInviteSchema, req.body);
      if (!db.select({ id: invites.id }).from(invites).where(openInvite(data.token)).get()) {
        throw invalidInvite();
      }
      if (db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).get())
        throw emailTaken();

      const passwordHash = await hashPassword(data.password);
      const user = db.transaction((tx) => {
        // Markera inbjudan som använd i samma transaktion – två samtidiga försök kan inte båda lyckas.
        const claimed = tx
          .update(invites)
          .set({ usedAt: nowIso() })
          .where(openInvite(data.token))
          .returning({ id: invites.id })
          .get();
        if (!claimed) throw invalidInvite();
        if (tx.select({ id: users.id }).from(users).where(eq(users.email, data.email)).get())
          throw emailTaken();
        const created = tx
          .insert(users)
          .values({ name: data.name, email: data.email, passwordHash, role: 'member' })
          .returning()
          .get();
        tx.update(invites).set({ usedBy: created.id }).where(eq(invites.id, claimed.id)).run();
        return created;
      });
      setSessionCookie(reply, createSession(db, user.id, req.headers['user-agent']), cookies);
      reply.status(201);
      return toPublicUser(user);
    });
  };

/** Routes som kräver inloggning (registreras bakom requireUser). */
export const accountRoutes =
  ({ db }: AuthDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/auth/me', async (req) => req.user);

    app.post('/auth/password', async (req, reply) => {
      const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
      const user = found(
        db.select().from(users).where(eq(users.id, req.user.id)).get(),
        'Användaren',
      );
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'currentPassword', message: 'Fel lösenord' },
        ]);
      }
      db.update(users)
        .set({ passwordHash: await hashPassword(newPassword), updatedAt: nowIso() })
        .where(eq(users.id, user.id))
        .run();
      // Övriga inloggningar (t.ex. en borttappad telefon) loggas ut.
      deleteUserSessions(db, user.id, req.sessionId);
      reply.status(204);
    });

    // Medlemmar och inbjudningar – bara ägaren.
    app.register(async (owner) => {
      owner.addHook('onRequest', requireOwner);

      owner.get('/users', async (): Promise<User[]> =>
        db.select().from(users).orderBy(users.createdAt, users.id).all().map(toPublicUser),
      );

      owner.delete('/users/:id', async (req, reply) => {
        const { id } = parse(idParamSchema, req.params);
        if (id === req.user.id)
          throw new HttpError(400, 'BAD_REQUEST', 'Du kan inte ta bort dig själv');
        // Sessioner försvinner via cascade, så personen loggas ut direkt.
        found(
          db
            .delete(users)
            .where(and(eq(users.id, id), ne(users.role, 'owner')))
            .returning()
            .get(),
          'Användaren',
        );
        reply.status(204);
      });

      const usedBy = alias(users, 'used_by_user');
      owner.get('/invites', async (): Promise<Invite[]> =>
        db
          .select({
            id: invites.id,
            note: invites.note,
            createdAt: invites.createdAt,
            expiresAt: invites.expiresAt,
            usedAt: invites.usedAt,
            usedByName: usedBy.name,
          })
          .from(invites)
          .leftJoin(usedBy, eq(usedBy.id, invites.usedBy))
          .orderBy(desc(invites.createdAt), desc(invites.id))
          .all(),
      );

      owner.post('/invites', async (req, reply): Promise<CreatedInvite> => {
        const { note } = parse(inviteCreateSchema, req.body);
        const token = newToken();
        const row = db
          .insert(invites)
          .values({
            tokenHash: hashToken(token),
            note: note ?? null,
            createdBy: req.user.id,
            expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          })
          .returning()
          .get();
        reply.status(201);
        return {
          id: row.id,
          note: row.note,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          usedAt: null,
          usedByName: null,
          token,
        };
      });

      owner.delete('/invites/:id', async (req, reply) => {
        const { id } = parse(idParamSchema, req.params);
        found(db.delete(invites).where(eq(invites.id, id)).returning().get(), 'Inbjudan');
        reply.status(204);
      });
    });
  };
