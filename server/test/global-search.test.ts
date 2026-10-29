import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snippetOf, searchWords } from '../src/queries/globalSearch.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

interface Hit {
  id: number;
  title: string;
  context: string | null;
  snippet: string | null;
  date: string | null;
  amountOre: number | null;
  href: string;
}
interface Results {
  query: string;
  total: number;
  groups: { kind: string; label: string; hits: Hit[] }[];
}

describe('global sökning', () => {
  let ctx: TestCtx;
  let room: number;
  let project: number;

  const post = async (url: string, payload: object) =>
    (await ctx.app.inject({ method: 'POST', url, payload })).json();
  const search = async (q: string): Promise<Results> =>
    (await ctx.app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent(q)}` })).json();
  const kinds = (r: Results) => r.groups.map((g) => g.kind);
  const hits = (r: Results, kind: string) => r.groups.find((g) => g.kind === kind)?.hits ?? [];

  beforeEach(async () => {
    ctx = createTestApp();
    room = (
      await post('/api/rooms', {
        name: 'Kök',
        floor: 'Plan 1',
        description: 'Öppet mot vardagsrummet',
      })
    ).id;
    project = (
      await post('/api/projects', {
        title: 'Nytt kök',
        description: 'Nya skåp och bänkskiva i ek',
        roomIds: [room],
      })
    ).id;
    await post('/api/contractors', {
      name: 'Bygg & Kakel AB',
      phone: '070-123 45 67',
      email: 'info@byggkakel.example',
      notes: 'Rekommenderad av grannen',
    });
    await post(`/api/projects/${project}/expenses`, {
      date: '2026-04-02',
      description: 'Bänkskiva ek',
      store: 'Byggmax',
      category: 'material',
      amountOre: 2_300_000,
    });
    await post(`/api/projects/${project}/tasks`, {
      title: 'Beställ bänkskiva',
      dueDate: '2026-11-01',
    });
    await post('/api/notes', {
      projectId: project,
      content:
        'Elektrikern kommer vecka 28.\nHusets huvudsäkring är 20 A – kontrollera att det räcker för induktionshällen och att gruppcentralen har plats för fler grupper.',
    });
    await post('/api/notes', { roomId: room, content: 'Golvvärmen i köket styrs från hallen' });
    await post(`/api/rooms/${room}/materials`, {
      surface: 'vagg',
      type: 'farg',
      name: 'Väggfärg',
      brand: 'Alcro',
      colorCode: 'NCS S 0502-Y',
    });
    await post('/api/maintenance', {
      title: 'Rengör fläktfilter',
      roomId: room,
      intervalMonths: 3,
      firstDueOn: '2026-12-01',
    });
    await post(`/api/projects/${project}/quotes`, {
      supplierName: 'Snickeri Svensson',
      amountOre: 8_500_000,
      description: 'Fönster och montering',
      validUntil: '2026-12-01',
    });
  });
  afterEach(() => ctx.close());

  it('hittar projekt, utgifter och uppgifter på samma ord, i fast ordning', async () => {
    const r = await search('bänkskiva');
    expect(kinds(r)).toEqual(['projekt', 'utgift', 'uppgift']);
    expect(r.total).toBe(3);
    expect(r.query).toBe('bänkskiva');

    expect(hits(r, 'projekt')[0]).toMatchObject({
      title: 'Nytt kök',
      context: 'Planerad',
      snippet: 'Nya skåp och bänkskiva i ek',
      href: `/projekt/${project}`,
    });
    expect(hits(r, 'utgift')[0]).toMatchObject({
      title: 'Bänkskiva ek',
      context: 'Nytt kök · Byggmax',
      date: '2026-04-02',
      amountOre: 2_300_000,
      href: `/projekt/${project}?flik=utgifter`,
    });
    expect(hits(r, 'uppgift')[0]).toMatchObject({
      title: 'Beställ bänkskiva',
      context: 'Nytt kök',
      date: '2026-11-01',
      href: `/projekt/${project}?flik=uppgifter`,
    });
  });

  it('hittar anteckningar med utdrag kring träffen, på projekt och på rum', async () => {
    const r = await search('huvudsäkring');
    expect(kinds(r)).toEqual(['anteckning']);
    const note = hits(r, 'anteckning')[0]!;
    expect(note.title).toBe('Elektrikern kommer vecka 28.');
    expect(note.snippet).toContain('huvudsäkring');
    expect(note.snippet!.length).toBeLessThan(200);
    expect(note.context).toBe('Nytt kök');
    expect(note.href).toBe(`/projekt/${project}?flik=anteckningar`);

    const roomNote = await search('golvvärmen');
    expect(hits(roomNote, 'anteckning')[0]).toMatchObject({
      context: 'Kök',
      href: `/rum/${room}`,
    });
  });

  it('visar en enradig anteckning som utdrag och upprepar ingen text', async () => {
    const roomNote = hits(await search('golvvärmen'), 'anteckning')[0]!;
    expect(roomNote.title).toBe('Golvvärmen i köket styrs från hallen');
    expect(roomNote.snippet).toBeNull();

    // Flerradig anteckning där träffen redan syns i första raden: inget extra utdrag.
    await post('/api/notes', {
      projectId: project,
      content: 'Ring elektrikern\nNummer finns hos grannen',
    });
    const multi = hits(await search('elektrikern'), 'anteckning').find((h) =>
      h.title.startsWith('Ring'),
    )!;
    expect(multi).toMatchObject({ title: 'Ring elektrikern', snippet: null });

    // Är träffen på en senare rad får den ett utdrag.
    const later = hits(await search('grannen'), 'anteckning').find((h) =>
      h.title.startsWith('Ring'),
    )!;
    expect(later.snippet).toBe('Ring elektrikern Nummer finns hos grannen');
  });

  it('hittar material på märke, kulörkod och namn', async () => {
    for (const q of ['alcro', 'NCS S 0502', 'väggfärg']) {
      const m = hits(await search(q), 'material');
      expect(m, q).toHaveLength(1);
      expect(m[0]).toMatchObject({
        title: 'Väggfärg',
        context: 'Kök · Alcro · NCS S 0502-Y',
        href: `/rum/${room}`,
      });
    }
  });

  it('hittar rum, hantverkare, underhåll och offerter', async () => {
    expect(hits(await search('plan 1'), 'rum')[0]).toMatchObject({
      title: 'Kök',
      context: 'Plan 1',
    });
    expect(hits(await search('grannen'), 'hantverkare')[0]).toMatchObject({
      title: 'Bygg & Kakel AB',
      context: '070-123 45 67 · info@byggkakel.example',
      snippet: 'Rekommenderad av grannen',
      href: '/hantverkare',
    });
    expect(hits(await search('fläktfilter'), 'underhall')[0]).toMatchObject({
      title: 'Rengör fläktfilter',
      context: 'Kök',
      href: '/underhall',
    });
    expect(hits(await search('snickeri'), 'offert')[0]).toMatchObject({
      title: 'Snickeri Svensson',
      context: 'Nytt kök',
      amountOre: 8_500_000,
      snippet: null,
      href: `/projekt/${project}?flik=offerter`,
    });
    expect(hits(await search('montering'), 'offert')[0]!.snippet).toBe('Fönster och montering');
  });

  it('kräver att alla ord matchar, men de får finnas i olika fält', async () => {
    // "alcro" finns i märket och "kök" i rummets namn.
    expect(hits(await search('alcro kök'), 'material')).toHaveLength(1);
    expect(hits(await search('kök alcro'), 'material')).toHaveLength(1);
    expect(await search('alcro badrum')).toMatchObject({ total: 0, groups: [] });
  });

  it('skiljer inte på versaler och hanterar å, ä och ö', async () => {
    for (const q of ['KÖK', 'kök', 'KöK', 'BÄNKSKIVA', 'Fläktfilter']) {
      expect((await search(q)).total, q).toBeGreaterThan(0);
    }
  });

  it('tolkar % och _ som vanliga tecken, inte som jokertecken', async () => {
    expect((await search('%%')).total).toBe(0);
    expect((await search('b_nkskiva')).total).toBe(0);
    await post('/api/notes', { projectId: project, content: 'Rabatt 100% på kakel' });
    const r = await search('100%');
    expect(hits(r, 'anteckning')).toHaveLength(1);
    expect(r.total).toBe(1);
  });

  it('ger tomt svar utan träff och utelämnar sorter utan träffar', async () => {
    expect(await search('finnsinte')).toEqual({ query: 'finnsinte', total: 0, groups: [] });
    expect(kinds(await search('alcro'))).toEqual(['material']);
  });

  it('begränsar antalet träffar per sort', async () => {
    for (let i = 0; i < 55; i++) {
      await post(`/api/projects/${project}/tasks`, { title: `Skruva lister ${i}` });
    }
    const uppgifter = hits(await search('skruva lister'), 'uppgift');
    expect(uppgifter).toHaveLength(50);
  });

  it('nekar för korta sökningar och saknad söktext', async () => {
    for (const url of ['/api/search?q=a', '/api/search?q=%20%20', '/api/search']) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(400);
    }
    const long = await ctx.app.inject({ method: 'GET', url: `/api/search?q=${'x'.repeat(101)}` });
    expect(long.statusCode).toBe(400);
  });

  it('kräver inloggning', async () => {
    const anon = createTestApp({ authenticated: false });
    expect((await anon.app.inject({ method: 'GET', url: '/api/search?q=kök' })).statusCode).toBe(
      401,
    );
    await anon.close();
  });
});

describe('söktexthjälpare', () => {
  it('delar upp sökorden i gemener, högst fem', () => {
    expect(searchWords('  ALCRO   Kök ÄÖÅ ')).toEqual(['alcro', 'kök', 'äöå']);
    expect(searchWords('a b c d e f g')).toHaveLength(5);
  });

  it('klipper ut ett utdrag kring första träffen med ellipser', () => {
    const text = `${'a '.repeat(100)}NYCKELORD ${'b '.repeat(100)}`;
    const s = snippetOf(text, ['nyckelord'])!;
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('NYCKELORD');
    expect(snippetOf('kort text', ['text'])).toBe('kort text');
  });

  it('ger inget utdrag när orden inte finns eller texten saknas', () => {
    expect(snippetOf('något helt annat', ['kök'])).toBeNull();
    expect(snippetOf(null, ['kök'])).toBeNull();
    expect(snippetOf('', ['kök'])).toBeNull();
  });

  it('slår ihop radbrytningar i utdraget', () => {
    expect(snippetOf('rad ett\n\nrad   två', ['två'])).toBe('rad ett rad två');
  });
});
