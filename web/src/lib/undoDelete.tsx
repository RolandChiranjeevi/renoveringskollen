import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client.ts';

/** Så länge går det att ångra en borttagning. */
export const UNDO_MS = 8000;
const ERROR_MS = 6000;

export type DeleteKind =
  | 'expense'
  | 'task'
  | 'note'
  | 'material'
  | 'measurement'
  | 'attachment'
  | 'maintenance'
  | 'maintenanceLog'
  | 'quote'
  | 'contractor';

const PATHS: Record<DeleteKind, (id: number) => string> = {
  expense: (id) => `/expenses/${id}`,
  task: (id) => `/tasks/${id}`,
  note: (id) => `/notes/${id}`,
  material: (id) => `/materials/${id}`,
  measurement: (id) => `/measurements/${id}`,
  attachment: (id) => `/attachments/${id}`,
  maintenance: (id) => `/maintenance/${id}`,
  maintenanceLog: (id) => `/maintenance-log/${id}`,
  quote: (id) => `/quotes/${id}`,
  contractor: (id) => `/contractors/${id}`,
};

interface Pending {
  key: string;
  kind: DeleteKind;
  id: number;
  /** T.ex. `Utgiften ”Kakel”` – visas som "<label> togs bort". */
  label: string;
  timer: ReturnType<typeof setTimeout>;
}

interface UndoContextValue {
  pending: Pending[];
  schedule: (kind: DeleteKind, id: number, label: string) => void;
  undo: (key: string) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

function useUndoContext(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('UndoProvider saknas');
  return ctx;
}

/**
 * Ta bort med ångra-möjlighet. Posten döljs direkt, men själva borttagningen skickas först när
 * tiden gått ut (eller när fliken stängs). Ångrar man har ingenting hänt på servern.
 */
export function useUndoableDelete() {
  return useUndoContext().schedule;
}

/** Id:n som just nu är dolda i väntan på borttagning – filtrera listor med dem. */
export function useHiddenIds(kind: DeleteKind): ReadonlySet<number> {
  const { pending } = useUndoContext();
  return useMemo(
    () => new Set(pending.filter((p) => p.kind === kind).map((p) => p.id)),
    [pending, kind],
  );
}

/** Samma som en query, men utan de poster som just nu väntar på borttagning. */
export function withoutHidden<T extends { id: number }>(
  query: { data: T[] | undefined; error: unknown; isPending: boolean },
  hidden: ReadonlySet<number>,
) {
  return {
    data: query.data?.filter((item) => !hidden.has(item.id)),
    error: query.error,
    isPending: query.isPending,
  };
}

interface Failure {
  key: string;
  text: string;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const pendingRef = useRef<Pending[]>([]);

  const setAll = useCallback((next: Pending[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const commit = useCallback(
    async (entry: Pending) => {
      try {
        await api.delete(PATHS[entry.kind](entry.id));
        await qc.invalidateQueries();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Redan borta (t.ex. borttagen på annat håll) – inget att göra.
          await qc.invalidateQueries();
        } else {
          const key = `${entry.key}:${Date.now()}`;
          setFailures((f) => [...f, { key, text: `${entry.label} gick inte att ta bort.` }]);
          setTimeout(() => setFailures((f) => f.filter((x) => x.key !== key)), ERROR_MS);
        }
      } finally {
        setAll(pendingRef.current.filter((p) => p.key !== entry.key));
      }
    },
    [qc, setAll],
  );

  const schedule = useCallback(
    (kind: DeleteKind, id: number, label: string) => {
      const key = `${kind}:${id}`;
      if (pendingRef.current.some((p) => p.key === key)) return;
      const entry: Pending = {
        key,
        kind,
        id,
        label,
        timer: setTimeout(() => void commit(entry), UNDO_MS),
      };
      setAll([...pendingRef.current, entry]);
    },
    [commit, setAll],
  );

  const undo = useCallback(
    (key: string) => {
      const entry = pendingRef.current.find((p) => p.key === key);
      if (!entry) return;
      clearTimeout(entry.timer);
      setAll(pendingRef.current.filter((p) => p.key !== key));
    },
    [setAll],
  );

  // Stänger man fliken eller laddar om sidan ska det man tagit bort faktiskt bli borttaget.
  useEffect(() => {
    const flush = () => {
      for (const entry of pendingRef.current) {
        clearTimeout(entry.timer);
        void api.delete(PATHS[entry.kind](entry.id)).catch(() => undefined);
      }
      pendingRef.current = [];
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const value = useMemo(() => ({ pending, schedule, undo }), [pending, schedule, undo]);

  return (
    <UndoContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
        role="status"
        aria-live="polite"
      >
        {pending.map((p) => (
          <div
            key={p.key}
            className="pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-xl bg-ink px-4 py-3 text-sm text-surface shadow-lg"
          >
            <span className="min-w-0 flex-1 truncate">{p.label} togs bort</span>
            <button
              type="button"
              onClick={() => undo(p.key)}
              className="rounded-md px-2 py-1 font-semibold text-brand-100 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100"
            >
              Ångra
            </button>
            <span
              aria-hidden
              className="undo-bar absolute bottom-0 left-0 h-0.5 bg-brand-100/70"
              style={{ animationDuration: `${UNDO_MS}ms` }}
            />
          </div>
        ))}
        {failures.map((f) => (
          <div
            key={f.key}
            role="alert"
            className="pointer-events-auto w-full max-w-md rounded-xl bg-danger px-4 py-3 text-sm text-canvas shadow-lg"
          >
            {f.text}
          </div>
        ))}
      </div>
    </UndoContext.Provider>
  );
}
