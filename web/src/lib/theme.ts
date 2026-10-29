import { useSyncExternalStore } from 'react';

// Ljust/mörkt läge. Valet sparas i webbläsaren; saknas det följer appen enhetens inställning.
// /theme-init.js (public/) gör samma val innan sidan ritas första gången – håll dem i synk.

export type ThemePreference = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'renoveringskollen-tema';
export const THEME_LABELS: Record<ThemePreference, string> = {
  auto: 'Följ enheten',
  light: 'Ljust',
  dark: 'Mörkt',
};
const THEME_COLORS: Record<Theme, string> = { light: '#f6f4f0', dark: '#171513' };

/** Lagring kan saknas eller vara blockerad (privat läge m.m.), så allt runt den tål att misslyckas. */
export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  if (pref === 'auto') return systemDark ? 'dark' : 'light';
  return pref;
}

const systemDarkQuery = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;

export function applyTheme(pref: ThemePreference = readPreference()): Theme {
  const theme = resolveTheme(pref, systemDarkQuery()?.matches ?? false);
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  return theme;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setPreference(pref: ThemePreference) {
  try {
    if (pref === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Valet gäller ändå tills sidan laddas om.
  }
  applyTheme(pref);
  notify();
}

/**
 * Följer enhetens inställning medan valet är "Följ enheten", och andra flikars val.
 * Anropas en gång när appen startar; returnerar en funktion som avregistrerar.
 */
export function watchSystemTheme(): () => void {
  const query = systemDarkQuery();
  const onSystem = () => {
    if (readPreference() === 'auto') applyTheme('auto');
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) {
      applyTheme();
      notify();
    }
  };
  query?.addEventListener('change', onSystem);
  window.addEventListener('storage', onStorage);
  return () => {
    query?.removeEventListener('change', onSystem);
    window.removeEventListener('storage', onStorage);
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, readPreference, () => 'auto' as const);
  return [pref, setPreference];
}
