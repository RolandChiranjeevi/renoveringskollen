import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@reno/shared';
import type { Db } from '../db/client.ts';
import { HttpError } from '../http/errors.ts';
import { setSessionCookie, type CookieSettings } from './cookies.ts';
import { lookupSession, SESSION_COOKIE } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
    sessionId: string;
  }
}

/** onRequest-hook som kräver en giltig session. Routerna bakom den behöver inte känna till inloggning. */
export function makeRequireUser(db: Db, cookies: CookieSettings) {
  return async function requireUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE];
    const session = lookupSession(db, token);
    if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Du behöver logga in');
    request.user = session.user;
    request.sessionId = session.sessionId;
    if (session.renewed && token) setSessionCookie(reply, token, cookies);
  };
}

export async function requireOwner(request: FastifyRequest) {
  if (request.user.role !== 'owner') {
    throw new HttpError(403, 'FORBIDDEN', 'Bara ägaren kan göra det här');
  }
}
