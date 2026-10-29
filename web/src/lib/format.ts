import { formatSek, kronorToOre, type Ore } from '@reno/shared';

export { formatSek };

const dateFmt = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "2026-09-03" → "3 sep. 2026". Tolkar datum utan tid som lokalt datum. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Tolkar ett belopp i kronor som användaren skrivit, t.ex. "12 490,50" eller "1249.5".
 * Returnerar öre, eller undefined om texten inte är ett giltigt belopp.
 */
export function parseKronor(input: string): Ore | undefined {
  const cleaned = input.replace(/\s/g, '').replace(/kr$/i, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return kronorToOre(Number(cleaned));
}

/** Öre → text för inmatningsfält, t.ex. 1249050 → "12490,50". */
export function oreToInput(ore: Ore | null | undefined): string {
  if (!ore) return '';
  const kr = ore / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace('.', ',');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Lägger till hela månader. Dagen klämms till månadens sista dag om målmånaden är kortare
 * (31 jan + 1 månad = 28 feb). Samma regel som servern, så att förhandsvisningen stämmer.
 */
export function addMonthsIso(iso: string, months: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = Number(iso.slice(5, 7)) - 1 + months;
  const year = Number(iso.slice(0, 4)) + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  return `${year}-${pad(m + 1)}-${pad(Math.min(Number(iso.slice(8, 10)), lastDay))}`;
}

/** 1 → "varje månad", 12 → "varje år", 6 → "var 6:e månad", 24 → "vartannat år", 60 → "vart 5:e år". */
export function intervalText(months: number): string {
  if (months === 1) return 'varje månad';
  if (months === 2) return 'varannan månad';
  if (months === 12) return 'varje år';
  if (months === 24) return 'vartannat år';
  if (months % 12 === 0) return `vart ${months / 12}:e år`;
  return `var ${months}:e månad`;
}

/** "tillagd av Erik" – eller inget alls när namnet saknas (ensam användare eller äldre post). */
export const addedByText = (name: string | null | undefined): string | null =>
  name ? `tillagd av ${name}` : null;

/** Antal hela dagar från idag till ett datum (ÅÅÅÅ-MM-DD); negativt om datumet har passerat. */
export function daysUntil(iso: string, today = todayIso()): number {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((day(iso) - day(today)) / 86_400_000);
}

const dateTimeFmt = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "26 okt. 2026 12:36" – datum och klockslag i lokal tid, t.ex. för säkerhetskopior. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}
