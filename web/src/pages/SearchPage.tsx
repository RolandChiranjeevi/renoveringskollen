import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, X } from 'lucide-react';
import { SEARCH_MIN_LENGTH, type SearchHit } from '@reno/shared';
import { useGlobalSearch } from '../api/hooks.ts';
import { Card, ErrorBox, PageHeader, Spinner } from '../components/ui.tsx';
import { formatDate, formatSek } from '../lib/format.ts';
import { queryWords, splitByWords } from '../lib/highlight.ts';

/** Text där sökorden är markerade. */
function Marked({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {splitByWords(text, words).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-brand-100 px-0.5 text-ink">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function Hit({ hit, words }: { hit: SearchHit; words: string[] }) {
  const meta = [
    hit.date ? formatDate(hit.date) : null,
    hit.amountOre != null ? formatSek(hit.amountOre) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <Link
        to={hit.href}
        className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-canvas/60 pointer-coarse:py-4"
      >
        <span className="min-w-0">
          <span className="block font-medium">
            <Marked text={hit.title} words={words} />
          </span>
          {hit.context && (
            <span className="line-clamp-2 text-sm text-muted">
              <Marked text={hit.context} words={words} />
            </span>
          )}
          {hit.snippet && (
            <span className="mt-0.5 block text-sm text-muted">
              <Marked text={hit.snippet} words={words} />
            </span>
          )}
        </span>
        {meta && (
          <span className="shrink-0 text-right text-xs text-muted tabular-nums">{meta}</span>
        )}
      </Link>
    </li>
  );
}

/** Sök i allt på en gång. Texten ligger i adressen (?q=) så att en sökning kan bokmärkas och delas. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [text, setText] = useState(params.get('q') ?? '');
  const result = useGlobalSearch(q);
  const words = queryWords(q);

  // Uppdatera adressen först när man pausat en kort stund i skrivandet.
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(
      () => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }),
      250,
    );
    return () => clearTimeout(t);
  }, [text, q, setParams]);

  const tooShort = q.length < SEARCH_MIN_LENGTH;
  const data = result.data;

  return (
    <>
      <PageHeader
        title="Sök"
        subtitle="Projekt, utgifter, uppgifter, anteckningar, material och mer."
      />

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <label htmlFor="global-search" className="sr-only">
          Sök
        </label>
        <input
          id="global-search"
          type="search"
          autoFocus
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="t.ex. alcro kök, elektriker, kakel…"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-10 pl-10 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
        {text && (
          <button
            type="button"
            aria-label="Rensa sökningen"
            onClick={() => setText('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {tooShort ? (
        <p className="text-sm text-muted">
          Skriv minst två tecken. Du kan söka på flera ord samtidigt – alla måste finnas, men inte i
          samma fält: ”alcro kök” hittar Alcro-färgen i köket.
        </p>
      ) : result.error ? (
        <ErrorBox error={result.error} />
      ) : !data ? (
        <Spinner label="Söker…" />
      ) : data.total === 0 ? (
        <p role="status" className="text-sm text-muted">
          Inga träffar på ”{q}”. Prova ett kortare ord eller färre ord.
        </p>
      ) : (
        <div className="space-y-6">
          <p role="status" className="text-sm text-muted">
            {data.total} {data.total === 1 ? 'träff' : 'träffar'} på ”{data.query}”
          </p>
          {data.groups.map((g) => (
            <section key={g.kind} aria-labelledby={`search-${g.kind}`}>
              <h2 id={`search-${g.kind}`} className="mb-2 text-sm font-semibold text-muted">
                {g.label} <span className="font-normal">({g.hits.length})</span>
              </h2>
              <Card>
                <ul className="divide-y divide-line">
                  {g.hits.map((h) => (
                    <Hit key={`${g.kind}-${h.id}`} hit={h} words={words} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
