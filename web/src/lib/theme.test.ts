import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, applyTheme, readPreference, resolveTheme, setPreference } from './theme.ts';

describe('resolveTheme', () => {
  it('följer enheten i "auto" och annars valet', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('sparat val', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#f6f4f0">');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('är "auto" när inget är sparat eller värdet är ogiltigt', () => {
    expect(readPreference()).toBe('auto');
    localStorage.setItem(THEME_KEY, 'lila');
    expect(readPreference()).toBe('auto');
  });

  it('sparar ljust och mörkt, och tar bort valet för "auto"', () => {
    setPreference('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readPreference()).toBe('dark');
    setPreference('auto');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('sätter data-theme och webbläsarens temafärg', () => {
    setPreference('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#171513',
    );
    setPreference('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#f6f4f0',
    );
  });

  it('i "auto" avgör enhetens inställning', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {} }));
    expect(applyTheme('auto')).toBe('dark');
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }));
    expect(applyTheme('auto')).toBe('light');
  });

  it('klarar att lagringen är blockerad', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blockerad');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blockerad');
    });
    expect(readPreference()).toBe('auto');
    expect(() => setPreference('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

// Skydd mot att någon ändrar en färg så att text blir svårläst: räknar kontrasten (WCAG) för de
// viktiga text- och bakgrundsparen i båda lägena, direkt ur index.css.
describe('färgkontrast i index.css', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

  const tokens = (block: string): Record<string, string> =>
    Object.fromEntries(
      [...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]),
    );
  const lightStart = css.indexOf('@theme');
  const light = tokens(css.slice(lightStart, css.indexOf('}', lightStart)));
  const darkStart = css.indexOf("html[data-theme='dark'] {");
  const dark = tokens(css.slice(darkStart, css.indexOf('}', darkStart)));

  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  it('har samma uppsättning färger i det mörka läget som i det ljusa', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(12);
  });

  // [text, bakgrund, minsta kontrast]
  const pairs: [string, string, number][] = [
    ['ink', 'canvas', 4.5],
    ['ink', 'surface', 4.5],
    ['muted', 'canvas', 4.5],
    ['muted', 'surface', 4.5],
    ['brand-700', 'surface', 4.5],
    ['brand-700', 'canvas', 4.5],
    ['brand-700', 'brand-50', 4.5],
    ['danger', 'surface', 4.5],
    ['danger', 'canvas', 4.5],
    ['warn', 'surface', 4.5],
    ['warn', 'canvas', 4.5],
    ['surface', 'ink', 4.5],
    ['canvas', 'danger', 4.5],
    ['brand-500', 'surface', 3],
  ];

  for (const [mode, set] of [
    ['ljust', light],
    ['mörkt', dark],
  ] as const) {
    it.each(pairs)(`${mode}: %s på %s når minst %s:1`, (fg, bg, min) => {
      expect(contrast(set[fg]!, set[bg]!)).toBeGreaterThanOrEqual(min);
    });

    it(`${mode}: vit text på den gröna knappen når minst 4,5:1`, () => {
      expect(contrast('#ffffff', set['brand-600']!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
