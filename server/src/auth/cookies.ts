import type { FastifyReply } from 'fastify';
import { SESSION_COOKIE, SESSION_DAYS } from './sessions.ts';

export interface CookieSettings {
  /** Kräv HTTPS för cookien. Måste vara på när appen nås utanför localhost. */
  secure: boolean;
}

export function setSessionCookie(reply: FastifyReply, token: string, { secure }: CookieSettings) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply, { secure }: CookieSettings) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
