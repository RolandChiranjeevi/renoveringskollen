// Bildregler som webben och servern delar, så att "Före och efter" ser likadant ut överallt.

/** Bildtyper som webbläsare kan visa direkt (HEIC kan bara Safari visa). */
export const PREVIEWABLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const isPreviewable = (mimeType: string): boolean =>
  PREVIEWABLE_MIME_TYPES.includes(mimeType);

interface PairablePhoto {
  id: number;
  kind: string;
  mimeType: string;
  /** ISO-tid då bilden laddades upp. */
  createdAt: string;
}

const byAge = (a: PairablePhoto, b: PairablePhoto) =>
  a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

/**
 * Para ihop Före- och Efter-bilder i den ordning de laddades upp: första med första, andra med andra.
 * Bara bilder som går att visa räknas; överskott på ena sidan blir inga par.
 */
export function pairBeforeAfter<T extends PairablePhoto>(photos: T[]): { before: T; after: T }[] {
  const before = photos.filter((a) => a.kind === 'fore' && isPreviewable(a.mimeType)).sort(byAge);
  const after = photos.filter((a) => a.kind === 'efter' && isPreviewable(a.mimeType)).sort(byAge);
  return before.slice(0, after.length).map((b, i) => ({ before: b, after: after[i]! }));
}
