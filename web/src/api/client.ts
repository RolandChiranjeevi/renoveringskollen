import { CSRF_HEADER, type ApiErrorBody } from '@reno/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }

  /** Fältfel som { fältnamn: meddelande } för formulär. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) if (d.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Servern kräver rubriken på alla ändrande anrop (CSRF-skydd).
  const headers: Record<string, string> = method === 'GET' ? {} : { [CSRF_HEADER]: '1' };
  // keepalive låter en borttagning gå igenom även om fliken stängs precis efter (gäller små JSON-anrop).
  const init: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
    keepalive: method !== 'GET' && !(body instanceof FormData),
  };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Kunde inte nå servern. Är den igång?');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Fel ${res.status}`,
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: (path: string) => request<void>('DELETE', path),
};

export const attachmentUrl = (id: number, download = false) =>
  `/api/attachments/${id}/file${download ? '?download=1' : ''}`;
