import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { User } from '@reno/shared';
import type { Db } from '../db/client.ts';
import { sessions, users } from '../db/schema.ts';

export const SESSION_COOKIE = 'reno_session';
export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Slumpad token (256 bitar) för cookies och inbjudningslänkar. */
export const newToken = () => randomBytes(32).toString('base64url');
/** Bara hashen lagras, så en läckt databas inte ger inloggade sessioner. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const toPublicUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
});

export function createSession(db: Db, userId: number, userAgent?: string) {
  const token = newToken();
  const now = Date.now();
  db.insert(sessions)
    .values({
      id: hashToken(token),
      userId,
      userAgent: userAgent?.slice(0, 300) ?? null,
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_DAYS * DAY_MS).toISOString(),
    })
    .run();
  return token;
}

/**
 * Slår upp en session. Förlänger den (glidande giltighet) när mindre än halva tiden återstår;
 * `renewed` säger då att cookien bör sättas om.
 */
export function lookupSession(db: Db, token: string | undefined) {
  if (!token) return undefined;
  const id = hashToken(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return undefined;

  const now = Date.now();
  if (Date.parse(row.session.expiresAt) <= now) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return undefined;
  }
  const renewed = Date.parse(row.session.expiresAt) - now < (SESSION_DAYS / 2) * DAY_MS;
  // Uppdatera "senast sedd" högst en gång i timmen för att slippa en skrivning per anrop.
  if (renewed || now - Date.parse(row.session.lastSeenAt) > 60 * 60 * 1000) {
    db.update(sessions)
      .set({
        lastSeenAt: new Date(now).toISOString(),
        ...(renewed ? { expiresAt: new Date(now + SESSION_DAYS * DAY_MS).toISOString() } : {}),
      })
      .where(eq(sessions.id, id))
      .run();
  }
  return { sessionId: id, user: toPublicUser(row.user), renewed };
}

export const deleteSession = (db: Db, token: string) =>
  db
    .delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run();

/** Loggar ut användarens alla sessioner, utom eventuellt den som anges. */
export const deleteUserSessions = (db: Db, userId: number, exceptSessionId?: string) =>
  db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    )
    .run();

export const purgeExpiredSessions = (db: Db) =>
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
