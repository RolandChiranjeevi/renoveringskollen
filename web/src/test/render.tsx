import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: string, init: RequestInit) => { status?: number; body?: unknown };

/** Ersätter fetch med en hanterare; returnerar en lista över anropen. */
export function mockFetch(handler: Handler) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    });
    const { status = 200, body } = handler(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}
