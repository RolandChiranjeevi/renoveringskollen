import { describe, expect, it } from 'vitest';
import {
  addedByText,
  addMonthsIso,
  daysUntil,
  formatDateTime,
  formatBytes,
  formatDate,
  intervalText,
  oreToInput,
  parseKronor,
} from './format.ts';

describe('parseKronor', () => {
  it.each([
    ['12 490,50', 1_249_050],
    ['1249.5', 124_950],
    ['500', 50_000],
    ['1 000 kr', 100_000],
    ['0,05', 5],
  ])('tolkar %s', (input, ore) => expect(parseKronor(input)).toBe(ore));

  it.each(['', 'abc', '-100', '1,234', '12,5,0'])('nekar %s', (input) =>
    expect(parseKronor(input)).toBeUndefined(),
  );
});

describe('oreToInput', () => {
  it('visar hela kronor utan decimaler och annars med komma', () => {
    expect(oreToInput(50_000)).toBe('500');
    expect(oreToInput(124_950)).toBe('1249,50');
    expect(oreToInput(0)).toBe('');
  });

  it('går tillbaka till samma värde med parseKronor', () => {
    for (const ore of [1, 99, 1_249_050, 123_456_789])
      expect(parseKronor(oreToInput(ore))).toBe(ore);
  });
});

describe('formatDate', () => {
  it('visar svenskt datum utan tidszonsförskjutning', () => {
    expect(formatDate('2026-09-03')).toBe('3 sep. 2026');
    expect(formatDate(null)).toBe('–');
  });
});

describe('formatBytes', () => {
  it('väljer lämplig enhet', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });
});

describe('addMonthsIso', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-05-31', 12, '2027-05-31'],
    ['2028-02-29', 12, '2029-02-28'],
  ])('%s + %i månader = %s', (from, months, expected) => {
    expect(addMonthsIso(from, months)).toBe(expected);
  });
});

describe('intervalText', () => {
  it.each([
    [1, 'varje månad'],
    [2, 'varannan månad'],
    [3, 'var 3:e månad'],
    [6, 'var 6:e månad'],
    [12, 'varje år'],
    [18, 'var 18:e månad'],
    [24, 'vartannat år'],
    [60, 'vart 5:e år'],
  ])('%i månader = "%s"', (months, expected) => {
    expect(intervalText(months)).toBe(expected);
  });
});

describe('addedByText', () => {
  it('ger "tillagd av …" med namnet, och inget när namnet saknas', () => {
    expect(addedByText('Erik')).toBe('tillagd av Erik');
    expect(addedByText(null)).toBeNull();
    expect(addedByText(undefined)).toBeNull();
    expect(addedByText('')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('räknar hela dagar, även över månads- och årsskiften', () => {
    expect(daysUntil('2026-10-31', '2026-10-01')).toBe(30);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-10-01', '2026-10-01')).toBe(0);
    expect(daysUntil('2026-09-30', '2026-10-01')).toBe(-1);
    // Sommartidsskiftet ger inga halva dagar.
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2);
  });
});

describe('formatDateTime', () => {
  it('visar datum och klockslag, och ger tillbaka orimlig text oförändrad', () => {
    const text = formatDateTime(new Date(2026, 9, 26, 12, 36).toISOString());
    expect(text).toMatch(/26/);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/12[:.]36/);
    expect(formatDateTime('inte ett datum')).toBe('inte ett datum');
  });
});
