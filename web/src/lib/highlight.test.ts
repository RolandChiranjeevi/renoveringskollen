import { describe, expect, it } from 'vitest';
import { queryWords, splitByWords } from './highlight.ts';

const flat = (parts: { text: string; match: boolean }[]) =>
  parts.map((p) => (p.match ? `[${p.text}]` : p.text)).join('');

describe('queryWords', () => {
  it('delar på blanksteg, ignorerar extra mellanrum och tar högst fem', () => {
    expect(queryWords('  alcro   kök ')).toEqual(['alcro', 'kök']);
    expect(queryWords('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(queryWords('   ')).toEqual([]);
  });
});

describe('splitByWords', () => {
  it('markerar träffar oavsett versaler, även å, ä och ö', () => {
    expect(flat(splitByWords('Nytt KÖK med bänkskiva', ['kök']))).toBe('Nytt [KÖK] med bänkskiva');
    expect(flat(splitByWords('Bänkskiva och bänkar', ['BÄNK']))).toBe('[Bänk]skiva och [bänk]ar');
  });

  it('markerar flera ord, och träffar inne i ord', () => {
    expect(flat(splitByWords('Alcro väggfärg i köksskåp', ['alcro', 'kök']))).toBe(
      '[Alcro] väggfärg i [kök]sskåp',
    );
  });

  it('låter det längre ordet gå före det kortare när de överlappar', () => {
    expect(flat(splitByWords('färgglad', ['färg', 'färgglad']))).toBe('[färgglad]');
  });

  it('behandlar specialtecken som vanlig text', () => {
    expect(flat(splitByWords('Rabatt 100% (ex. moms)', ['100%', '(ex.']))).toBe(
      'Rabatt [100%] [(ex.] moms)',
    );
    expect(flat(splitByWords('a.b och axb', ['a.b']))).toBe('[a.b] och axb');
  });

  it('klarar tom text, inga ord och ingen träff', () => {
    expect(splitByWords('', ['kök'])).toEqual([]);
    expect(splitByWords('kök', [])).toEqual([{ text: 'kök', match: false }]);
    expect(splitByWords('badrum', ['kök'])).toEqual([{ text: 'badrum', match: false }]);
  });
});
