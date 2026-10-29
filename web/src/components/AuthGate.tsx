import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStatus } from '../api/auth.ts';
import { ErrorBox, Spinner } from './ui.tsx';

/** Visar innehållet bara för inloggade; skickar annars till första start eller inloggning. */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const location = useLocation();

  if (status.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (status.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox error={status.error} />
      </div>
    );
  }
  if (status.data.setupRequired) return <Navigate to="/forsta-start" replace />;
  if (!status.data.user) {
    const back = location.pathname + location.search;
    return (
      <Navigate
        to={back === '/' ? '/logga-in' : `/logga-in?till=${encodeURIComponent(back)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

/** Endast interna sökvägar, så att ?till= inte kan användas för att skicka vidare till andra sajter. */
export const safeReturnPath = (value: string | null) =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/';
