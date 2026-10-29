// CSV anpassad för svensk Excel: semikolon, decimalkomma, UTF-8 med BOM och CRLF.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let s = String(value);
  // Skydd mot formelinjektion i kalkylprogram ("=HYPERLINK(...)" i en beskrivning).
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Öre → "1249,50" (utan tusentalsavgränsare, så att Excel tolkar det som tal). */
export const oreToCsv = (ore: number) => (ore / 100).toFixed(2).replace('.', ',');

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
