const MAX_WORDS = 5;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sökorden så som servern tolkar dem: delade på blanksteg, högst fem. */
export function queryWords(q: string): string[] {
  return q.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Delar en text i delar som matchar sökorden och delar som inte gör det, utan hänsyn till
 * versaler (även å, ä, ö). Längre sökord går före kortare, så "kök" inom "köksskåp" blir en träff.
 */
export function splitByWords(text: string, words: string[]): TextPart[] {
  const usable = words.filter(Boolean).sort((a, b) => b.length - a.length);
  if (usable.length === 0 || !text) return text ? [{ text, match: false }] : [];
  const pattern = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'giu');
  return text
    .split(pattern)
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}
