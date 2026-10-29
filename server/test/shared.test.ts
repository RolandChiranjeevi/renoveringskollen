import { describe, expect, it } from 'vitest';
import { formatSek, isPreviewable, kronorToOre, pairBeforeAfter } from '@reno/shared';

describe('belopp', () => {
  it('räknar om kronor till öre utan flyttalsfel', () => {
    expect(kronorToOre(19.99)).toBe(1999);
    expect(kronorToOre(0.1 + 0.2)).toBe(30);
  });

  it('formaterar i svensk valuta', () => {
    expect(formatSek(1_249_000).replace(/\s/g, ' ')).toBe('12 490,00 kr');
  });
});

describe('pairBeforeAfter', () => {
  let nextId = 1;
  const photo = (kind: string, createdAt: string, mimeType = 'image/jpeg') => ({
    id: nextId++,
    kind,
    mimeType,
    createdAt,
  });

  it('paras ihop första före med första efter, i uppladdningsordning', () => {
    const f2 = photo('fore', '2026-05-02T10:00:00Z');
    const f1 = photo('fore', '2026-05-01T10:00:00Z');
    const e1 = photo('efter', '2026-06-01T10:00:00Z');
    const e2 = photo('efter', '2026-06-02T10:00:00Z');
    // Listan kan komma i vilken ordning som helst, t.ex. nyast först från servern.
    const pairs = pairBeforeAfter([e2, e1, f2, f1]);
    expect(pairs.map((p) => [p.before.id, p.after.id])).toEqual([
      [f1.id, e1.id],
      [f2.id, e2.id],
    ]);
  });

  it('ger bara så många par som det finns på båda sidor, och inga om en sida saknas', () => {
    const f1 = photo('fore', '2026-05-01T10:00:00Z');
    const f2 = photo('fore', '2026-05-02T10:00:00Z');
    const e1 = photo('efter', '2026-06-01T10:00:00Z');
    expect(pairBeforeAfter([f1, f2, e1])).toHaveLength(1);
    expect(pairBeforeAfter([f1, f2])).toEqual([]);
    expect(pairBeforeAfter([])).toEqual([]);
  });

  it('hoppar över bilder som inte kan visas och över övriga bilder', () => {
    const heic = photo('fore', '2026-05-01T10:00:00Z', 'image/heic');
    const f = photo('fore', '2026-05-02T10:00:00Z');
    const e = photo('efter', '2026-06-01T10:00:00Z');
    const other = photo('ovrigt', '2026-06-01T10:00:00Z');
    const pairs = pairBeforeAfter([heic, f, e, other]);
    expect(pairs.map((p) => [p.before.id, p.after.id])).toEqual([[f.id, e.id]]);
  });

  it('behåller allt extra på bilderna (t.ex. bildtext)', () => {
    const f = { ...photo('fore', '2026-05-01T10:00:00Z'), caption: 'Före rivning' };
    const e = { ...photo('efter', '2026-06-01T10:00:00Z'), caption: null };
    const [pair] = pairBeforeAfter([f, e]);
    expect(pair!.before.caption).toBe('Före rivning');
    expect(pair!.after.caption).toBeNull();
  });
});

describe('isPreviewable', () => {
  it('godkänner bilder som webbläsare visar direkt, inte HEIC eller PDF', () => {
    expect(['image/jpeg', 'image/png', 'image/webp'].every(isPreviewable)).toBe(true);
    expect(isPreviewable('image/heic')).toBe(false);
    expect(isPreviewable('application/pdf')).toBe(false);
  });
});
