// Datum som ÅÅÅÅ-MM-DD-text. Räknar i hela dagar, utan tidszonsfällor kring sommartid.

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** Dagens datum i serverns tidszon (inte UTC – det kan vara "igår" strax efter midnatt svensk tid). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const toUtc = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Antal dagar från `from` till `to`. Negativt om `to` ligger före. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export function addDays(iso: string, days: number): string {
  const d = new Date(toUtc(iso) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Lägger till hela månader. Dagen kläms till månadens sista dag om målmånaden är kortare,
 * så 31 jan + 1 månad blir 28 feb (29 feb under skottår) och 29 feb + 12 månader blir 28 feb.
 */
export function addMonths(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7)) - 1 + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(Number(iso.slice(8, 10)), lastDay);
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(day)}`;
}
