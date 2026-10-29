import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthStatus } from '@reno/shared';
import { AUTH_KEY } from './api/auth.ts';
import { ApiError } from './api/client.ts';
import { App } from './App.tsx';
import './index.css';
import { watchSystemTheme } from './lib/theme.ts';

// Har sessionen gått ut (401) markeras användaren som utloggad, så skickar AuthGate till inloggningen.
const onError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401) {
    queryClient.setQueryData<AuthStatus>(AUTH_KEY, (s) => (s ? { ...s, user: null } : s));
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx (t.ex. 404) blir inte bättre av att försöka igen.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Följer enhetens ljust/mörkt medan valet är "Följ enheten" (första valet görs av /theme-init.js).
watchSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
