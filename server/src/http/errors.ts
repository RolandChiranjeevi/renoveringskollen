import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resursen') =>
  new HttpError(404, 'NOT_FOUND', `${what} hittades inte`);

/** Hämtar en rad eller kastar 404. */
export function found<T>(row: T | undefined, what?: string): T {
  if (row === undefined) throw notFound(what);
  return row;
}

// SQLite-fel kommer från better-sqlite3, ibland inslagna av Drizzle (err.cause).
function sqliteCode(err: unknown): string | undefined {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('SQLITE_')) return code;
  }
  return undefined;
}

const SQLITE_ERRORS: Record<string, [number, string, string]> = {
  SQLITE_CONSTRAINT_FOREIGNKEY: [400, 'INVALID_REFERENCE', 'Hänvisar till något som inte finns'],
  SQLITE_CONSTRAINT_UNIQUE: [409, 'CONFLICT', 'Det finns redan en post med samma namn'],
  SQLITE_CONSTRAINT_PRIMARYKEY: [409, 'CONFLICT', 'Posten finns redan'],
  SQLITE_CONSTRAINT_CHECK: [400, 'VALIDATION_ERROR', 'Ogiltiga värden'],
};

const FASTIFY_MESSAGES: Record<string, string> = {
  FST_REQ_FILE_TOO_LARGE: 'Filen är för stor (max 10 MB)',
  FST_FILES_LIMIT: 'Endast en fil per uppladdning',
  FST_INVALID_MULTIPART_CONTENT_TYPE: 'Förväntade multipart/form-data',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Innehållstypen stöds inte',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'Tom förfrågan',
  FST_ERR_CTP_INVALID_JSON_BODY: 'Ogiltig JSON',
};

export function errorHandler(err: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const send = (status: number, error: ApiError['error']) => reply.status(status).send({ error });

  if (err instanceof HttpError) {
    return send(err.statusCode, { code: err.code, message: err.message, details: err.details });
  }

  const sqlite = sqliteCode(err);
  const mapped = sqlite ? SQLITE_ERRORS[sqlite] : undefined;
  if (mapped) {
    const [status, code, message] = mapped;
    return send(status, { code, message });
  }

  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    request.log.error(err);
    return send(500, { code: 'INTERNAL_ERROR', message: 'Något gick fel på servern' });
  }
  return send(status, {
    code: err.code ?? 'BAD_REQUEST',
    message: (err.code && FASTIFY_MESSAGES[err.code]) ?? err.message,
  });
}
