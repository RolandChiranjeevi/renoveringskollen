import { and, desc, eq, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import {
  PROJECT_STATUS_LABELS,
  SEARCH_KIND_LABELS,
  SEARCH_KINDS,
  SEARCH_MAX_PER_KIND,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
  type SearchResults,
} from '@reno/shared';
import type { Db } from '../db/client.ts';
import {
  contractors,
  expenses,
  maintenanceTasks,
  materials,
  notes,
  projects,
  quotes,
  rooms,
  tasks,
} from '../db/schema.ts';

const MAX_WORDS = 5;
const SNIPPET_RADIUS = 60;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Sökorden: gemener (även å, ä, ö), högst fem. */
export function searchWords(q: string): string[] {
  return q.toLocaleLowerCase('sv-SE').split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/** Varje ord måste finnas i minst en av kolumnerna: "alcro kök" hittar Alcro-färgen i köket. */
function matchAll(columns: SQLWrapper[], words: string[]): SQL {
  const perWord = words.map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    return or(
      ...columns.map((c) => sql`sv_lower(coalesce(${c}, '')) like ${pattern} escape '\\'`),
    )!;
  });
  return and(...perWord)!;
}

/** Ett kort utdrag ur en längre text, kring det första sökordet som finns i den. */
export function snippetOf(text: string | null | undefined, words: string[]): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLocaleLowerCase('sv-SE');
  const positions = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  if (positions.length === 0) return null;
  const at = Math.min(...positions);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(flat.length, at + SNIPPET_RADIUS * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/** Finns alla sökord i texten? */
const containsAll = (text: string, words: string[]) => {
  const lower = text.toLocaleLowerCase('sv-SE');
  return words.every((w) => lower.includes(w));
};

const firstLine = (text: string, max = 80) => {
  const line = text.split('\n')[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

const hit = (h: Partial<SearchHit> & Pick<SearchHit, 'id' | 'title' | 'href'>): SearchHit => ({
  context: null,
  snippet: null,
  date: null,
  amountOre: null,
  ...h,
});

type Finder = (db: Db, words: string[]) => SearchHit[];

const finders: Record<SearchKind, Finder> = {
  projekt: (db, words) =>
    db
      .select()
      .from(projects)
      .where(matchAll([projects.title, projects.description], words))
      .orderBy(projects.title)
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map((p) =>
        hit({
          id: p.id,
          title: p.title,
          context: PROJECT_STATUS_LABELS[p.status],
          snippet: snippetOf(p.description, words),
          href: `/projekt/${p.id}`,
        }),
      ),

  rum: (db, words) =>
    db
      .select()
      .from(rooms)
      .where(matchAll([rooms.name, rooms.description, rooms.floor], words))
      .orderBy(rooms.name)
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map((r) =>
        hit({
          id: r.id,
          title: r.name,
          context: r.floor,
          snippet: snippetOf(r.description, words),
          href: `/rum/${r.id}`,
        }),
      ),

  utgift: (db, words) =>
    db
      .select({ e: expenses, project: projects.title })
      .from(expenses)
      .innerJoin(projects, eq(projects.id, expenses.projectId))
      .where(matchAll([expenses.description, expenses.store, projects.title], words))
      .orderBy(desc(expenses.date), desc(expenses.id))
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ e, project }) =>
        hit({
          id: e.id,
          title: e.description,
          context: [project, e.store].filter(Boolean).join(' · '),
          date: e.date,
          amountOre: e.amountOre,
          href: `/projekt/${e.projectId}?flik=utgifter`,
        }),
      ),

  uppgift: (db, words) =>
    db
      .select({ t: tasks, project: projects.title })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(matchAll([tasks.title, projects.title], words))
      .orderBy(tasks.done, desc(tasks.id))
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ t, project }) =>
        hit({
          id: t.id,
          title: t.title,
          context: t.done ? `${project} · klar` : project,
          date: t.dueDate,
          href: `/projekt/${t.projectId}?flik=uppgifter`,
        }),
      ),

  anteckning: (db, words) =>
    db
      .select({ n: notes, project: projects.title, room: rooms.name })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(rooms, eq(rooms.id, notes.roomId))
      .where(matchAll([notes.content, projects.title, rooms.name], words))
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ n, project, room }) => {
        // En enradig anteckning visas som utdraget kring träffen; en flerradig med första raden som
        // rubrik och ett utdrag bara om träffen inte redan syns i rubriken. Så upprepas ingen text.
        const excerpt = snippetOf(n.content, words);
        const oneLine = !n.content.trim().includes('\n');
        const title = oneLine ? (excerpt ?? firstLine(n.content)) : firstLine(n.content);
        return hit({
          id: n.id,
          title,
          context: project ?? room,
          snippet: oneLine || containsAll(title, words) ? null : excerpt,
          date: n.createdAt,
          href: n.projectId ? `/projekt/${n.projectId}?flik=anteckningar` : `/rum/${n.roomId}`,
        });
      }),

  material: (db, words) =>
    db
      .select({ m: materials, room: rooms.name })
      .from(materials)
      .innerJoin(rooms, eq(rooms.id, materials.roomId))
      .where(
        matchAll(
          [
            materials.name,
            materials.brand,
            materials.colorCode,
            materials.finish,
            materials.quantity,
            materials.notes,
            rooms.name,
          ],
          words,
        ),
      )
      .orderBy(rooms.name, materials.name)
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ m, room }) =>
        hit({
          id: m.id,
          title: m.name,
          context: [room, m.brand, m.colorCode].filter(Boolean).join(' · '),
          snippet: snippetOf(m.notes, words),
          href: `/rum/${m.roomId}`,
        }),
      ),

  hantverkare: (db, words) =>
    db
      .select()
      .from(contractors)
      .where(
        matchAll(
          [
            contractors.name,
            contractors.orgNumber,
            contractors.phone,
            contractors.email,
            contractors.notes,
          ],
          words,
        ),
      )
      .orderBy(contractors.name)
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map((c) =>
        hit({
          id: c.id,
          title: c.name,
          context: [c.phone, c.email].filter(Boolean).join(' · ') || null,
          snippet: snippetOf(c.notes, words),
          href: '/hantverkare',
        }),
      ),

  underhall: (db, words) =>
    db
      .select({ m: maintenanceTasks, room: rooms.name })
      .from(maintenanceTasks)
      .leftJoin(rooms, eq(rooms.id, maintenanceTasks.roomId))
      .where(matchAll([maintenanceTasks.title, maintenanceTasks.notes, rooms.name], words))
      .orderBy(maintenanceTasks.title)
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ m, room }) =>
        hit({
          id: m.id,
          title: m.title,
          context: room ?? 'Hela huset',
          snippet: snippetOf(m.notes, words),
          href: '/underhall',
        }),
      ),

  offert: (db, words) =>
    db
      .select({ q: quotes, contractor: contractors.name, project: projects.title })
      .from(quotes)
      .innerJoin(projects, eq(projects.id, quotes.projectId))
      .leftJoin(contractors, eq(contractors.id, quotes.contractorId))
      .where(
        matchAll(
          [quotes.supplierName, quotes.description, contractors.name, projects.title],
          words,
        ),
      )
      .orderBy(desc(quotes.id))
      .limit(SEARCH_MAX_PER_KIND)
      .all()
      .map(({ q, contractor, project }) =>
        hit({
          id: q.id,
          title: contractor ?? q.supplierName ?? 'Okänd hantverkare',
          context: project,
          snippet: snippetOf(q.description, words),
          date: q.validUntil,
          amountOre: q.amountOre,
          href: `/projekt/${q.projectId}?flik=offerter`,
        }),
      ),
};

/** Söker i allt på en gång. Träffar grupperas per sort; sorter utan träffar utelämnas. */
export function globalSearch(db: Db, q: string): SearchResults {
  const words = searchWords(q);
  const groups: SearchGroup[] = SEARCH_KINDS.map((kind) => ({
    kind,
    label: SEARCH_KIND_LABELS[kind],
    hits: finders[kind](db, words),
  })).filter((g) => g.hits.length > 0);
  return { query: q, total: groups.reduce((n, g) => n + g.hits.length, 0), groups };
}
