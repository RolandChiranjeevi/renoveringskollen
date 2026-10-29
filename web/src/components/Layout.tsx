import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  CircleUserRound,
  DoorOpen,
  FileText,
  Hammer,
  HardHat,
  House,
  Landmark,
  Menu,
  Receipt,
  Search,
  Wrench,
} from 'lucide-react';
import { useCurrentUser } from '../api/auth.ts';
import { UndoProvider } from '../lib/undoDelete.tsx';
import { cx } from './ui.tsx';

const links = [
  { to: '/', label: 'Översikt', icon: House, end: true },
  { to: '/projekt', label: 'Projekt', icon: Hammer },
  { to: '/utgifter', label: 'Utgifter', icon: Receipt },
  { to: '/rum', label: 'Rum', icon: DoorOpen },
  { to: '/underhall', label: 'Underhåll', icon: Wrench },
  { to: '/hantverkare', label: 'Hantverkare', icon: HardHat },
];

// Fem flikar räcker i bottenmenyn på mobil; resten ligger under "Mer".
const bottomLinks = links.filter((l) =>
  ['/', '/projekt', '/utgifter', '/underhall'].includes(l.to),
);
const moreLinks = [
  { to: '/rum', label: 'Rum', icon: DoorOpen },
  { to: '/hantverkare', label: 'Hantverkare', icon: HardHat },
  { to: '/rapport', label: 'Rapport', icon: FileText },
  { to: '/forsaljning', label: 'Försäljningsunderlag', icon: Landmark },
  { to: '/konto', label: 'Konto', icon: CircleUserRound },
];

/** "Mer"-fliken i bottenmenyn: en liten meny med det som inte får plats bland de fyra vanligaste. */
function MoreMenu() {
  const { pathname } = useLocation();
  // Öppen "för den här sidan": när man navigerar byts pathname och menyn är stängd igen, utan effekt.
  const [openAt, setOpenAt] = useState<string>();
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : undefined);
  const active = moreLinks.some((l) => pathname.startsWith(l.to));

  // Stäng med Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAt(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen(!open)}
        className={cx(
          'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
          active || open ? 'text-brand-700' : 'text-muted',
        )}
      >
        <Menu className="size-5" aria-hidden />
        Mer
      </button>
      {open &&
        // Utanför bottenfältet: dess oskärpa gör annars fältet till referens för fast positionering.
        createPortal(
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Stäng menyn"
              className="fixed inset-0 z-[9] cursor-default"
              onClick={() => setOpen(false)}
            />
            <ul
              id="more-menu"
              className="fixed right-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              {moreLinks.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-ink/5',
                      )
                    }
                  >
                    <Icon className="size-4 text-muted" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </>,
          document.body,
        )}
    </>
  );
}

/** "/" eller Ctrl/Cmd+K öppnar sökningen, om man inte just skriver i ett fält. */
function useSearchShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
      const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      const palette = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey);
      if (slash || palette) {
        e.preventDefault();
        navigate('/sok');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

export function Layout() {
  const user = useCurrentUser();
  useSearchShortcut();
  return (
    <UndoProvider>
      <div className="min-h-dvh md:flex">
        {/* Sidomeny på större skärmar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 md:flex print:hidden">
          <div className="mb-6 flex items-center gap-2 px-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-semibold tracking-tight">Renoveringskollen</span>
          </div>
          <NavLink
            to="/sok"
            className={({ isActive }) =>
              cx(
                'mb-3 flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition-colors',
                isActive
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line bg-surface text-muted hover:text-ink',
              )
            }
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1">Sök</span>
            <kbd className="rounded border border-line px-1.5 text-xs" aria-hidden>
              /
            </kbd>
          </NavLink>
          <nav className="space-y-0.5" aria-label="Huvudmeny">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-muted hover:bg-ink/5 hover:text-ink',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <NavLink
            to="/konto"
            className={({ isActive }) =>
              cx(
                'mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-muted hover:bg-ink/5 hover:text-ink',
              )
            }
          >
            <CircleUserRound className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{user.name}</span>
              <span className="block text-xs">Konto och inloggning</span>
            </span>
          </NavLink>
        </aside>

        {/* Toppfält på mobil, med väg till kontot */}
        <header className="flex items-center justify-between border-b border-line bg-surface/80 px-4 py-2.5 md:hidden print:hidden">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="text-sm font-semibold tracking-tight">Renoveringskollen</span>
          </Link>
          <span className="flex items-center">
            <Link to="/sok" className="rounded-full p-2 text-muted hover:text-ink" aria-label="Sök">
              <Search className="size-5" />
            </Link>
            <Link
              to="/konto"
              className="rounded-full p-1.5 text-muted hover:text-ink"
              aria-label={`Konto (${user.name})`}
            >
              <CircleUserRound className="size-6" />
            </Link>
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24 sm:px-6 md:pt-10 md:pb-10 print:max-w-none print:p-0">
          <Outlet />
        </main>

        {/* Bottenmeny på mobil */}
        <nav
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
          aria-label="Huvudmeny"
        >
          {bottomLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-700' : 'text-muted',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
          <MoreMenu />
        </nav>
      </div>
    </UndoProvider>
  );
}
