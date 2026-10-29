import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Download, Paperclip, Receipt, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type ExpenseSearch,
} from '@reno/shared';
import { searchQuery, useExpenseSearch, useProjects, useRooms } from '../api/hooks.ts';
import { ReceiptInbox } from '../components/ReceiptInbox.tsx';
import { Button, Card, cx, EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui.tsx';
import { addedByText, formatDate, formatSek } from '../lib/format.ts';
import { useHiddenIds } from '../lib/undoDelete.tsx';

const controlClass = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm';

const EMPTY_FILTERS: ExpenseSearch = {
  q: undefined,
  from: undefined,
  to: undefined,
  category: undefined,
  roomId: undefined,
  projectId: undefined,
};

/** Filtren ligger i adressen så att en filtrerad vy kan bokmärkas. */
function useFilters(): [ExpenseSearch, (patch: Partial<ExpenseSearch>) => void] {
  const [params, setParams] = useSearchParams();
  const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
  const category = params.get('category') ?? '';
  const filters: ExpenseSearch = {
    q: params.get('q') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category)
      ? (category as ExpenseCategory)
      : undefined,
    roomId: num('roomId'),
    projectId: num('projectId'),
    sort: params.get('sort') === 'amount' ? 'amount' : 'date',
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
  };

  const update = (patch: Partial<ExpenseSearch>) => {
    const next = { ...filters, ...patch };
    // Standardsorteringen (datum, senaste först) hålls utanför adressen.
    if (next.sort === 'date') next.sort = undefined;
    if (next.order === 'desc') next.order = undefined;
    setParams(searchQuery(next), { replace: true });
  };
  return [filters, update];
}

export function ExpensesPage() {
  const [filters, update] = useFilters();
  const result = useExpenseSearch(filters);
  const hidden = useHiddenIds('expense');
  // På mobil ligger filtren bakom en knapp; på större skärmar syns de alltid.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rooms = useRooms();
  const projects = useProjects();
  const [q, setQ] = useState(filters.q ?? '');

  // Sök medan man skriver, men först när man pausat en kort stund.
  useEffect(() => {
    if ((filters.q ?? '') === q) return;
    const t = setTimeout(() => update({ q: q || undefined }), 250);
    return () => clearTimeout(t);
  });

  const hasFilters = !!(
    filters.q ||
    filters.from ||
    filters.to ||
    filters.category ||
    filters.roomId ||
    filters.projectId
  );
  const activeFilters = [
    filters.from,
    filters.to,
    filters.category,
    filters.roomId,
    filters.projectId,
  ].filter(Boolean).length;
  const year = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Utgifter"
        subtitle="Sök och filtrera bland alla inköp och fakturor."
        actions={
          <a
            href={`/api/export/expenses.csv?${searchQuery(filters)}`}
            download
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium shadow-sm hover:bg-canvas"
          >
            <Download className="size-4" aria-hidden /> Exportera CSV
          </a>
        }
      />

      <ReceiptInbox />

      <Card className="mb-4 space-y-3 p-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <label htmlFor="expense-search" className="sr-only">
              Sök
            </label>
            <input
              id="expense-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sök utgifter…"
              className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
          <Button
            variant="secondary"
            className="md:hidden"
            aria-expanded={filtersOpen}
            aria-controls="expense-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="size-4" aria-hidden /> Filter
            {activeFilters > 0 && (
              <span className="rounded-full bg-brand-50 px-1.5 text-xs text-brand-700">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>
        <div
          id="expense-filters"
          className={cx('flex-wrap items-center gap-2 md:flex', filtersOpen ? 'flex' : 'hidden')}
        >
          <input
            aria-label="Från datum"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => update({ from: e.target.value || undefined })}
            className={controlClass}
          />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <input
            aria-label="Till datum"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => update({ to: e.target.value || undefined })}
            className={controlClass}
          />
          <button
            type="button"
            className="text-xs text-brand-700 hover:underline pointer-coarse:px-2 pointer-coarse:py-3"
            onClick={() => update({ from: `${year}-01-01`, to: `${year}-12-31` })}
          >
            I år
          </button>
          <select
            aria-label="Kategori"
            value={filters.category ?? ''}
            onChange={(e) =>
              update({ category: (e.target.value || undefined) as ExpenseCategory | undefined })
            }
            className={controlClass}
          >
            <option value="">Alla kategorier</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            aria-label="Rum"
            value={filters.roomId ?? ''}
            onChange={(e) =>
              update({ roomId: e.target.value ? Number(e.target.value) : undefined })
            }
            className={controlClass}
          >
            <option value="">Alla rum</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Projekt"
            value={filters.projectId ?? ''}
            onChange={(e) =>
              update({ projectId: e.target.value ? Number(e.target.value) : undefined })
            }
            className={`${controlClass} max-w-48`}
          >
            <option value="">Alla projekt</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Sortering"
            value={`${filters.sort}-${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split('-') as [
                'date' | 'amount',
                'asc' | 'desc',
              ];
              update({ sort, order });
            }}
            className={controlClass}
          >
            <option value="date-desc">Senaste först</option>
            <option value="date-asc">Äldsta först</option>
            <option value="amount-desc">Högst belopp</option>
            <option value="amount-asc">Lägst belopp</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('');
                update(EMPTY_FILTERS);
              }}
            >
              <X className="size-3.5" aria-hidden /> Rensa
            </Button>
          )}
        </div>
      </Card>

      {result.error ? (
        <ErrorBox error={result.error} />
      ) : !result.data ? (
        <Spinner />
      ) : result.data.count === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" />}
          title={hasFilters ? 'Inga utgifter matchar' : 'Inga utgifter ännu'}
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            {result.data.count} {result.data.count === 1 ? 'utgift' : 'utgifter'} ·{' '}
            <span className="font-semibold text-ink">{formatSek(result.data.totalOre)}</span>
          </p>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="hidden border-b border-line bg-canvas/60 text-left text-xs text-muted sm:table-header-group">
                <tr>
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Vad</th>
                  <th className="px-4 py-2 font-medium">Projekt</th>
                  <th className="px-4 py-2 font-medium">Kategori</th>
                  <th className="px-4 py-2 text-right font-medium">Belopp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.items
                  .filter((e) => !hidden.has(e.id))
                  .map((e) => (
                    <tr key={e.id} className="block px-4 py-2.5 sm:table-row sm:p-0">
                      <td className="block text-xs text-muted sm:table-cell sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap">
                        {formatDate(e.date)}
                      </td>
                      <td className="block sm:table-cell sm:px-4 sm:py-2.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          {e.description}
                          {e.attachmentCount > 0 && (
                            <Paperclip
                              className="size-3.5 shrink-0 text-muted"
                              aria-label="Kvitto bifogat"
                            />
                          )}
                        </span>
                        <span className="text-xs text-muted">
                          {[e.store, e.roomName, addedByText(e.createdByName)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </td>
                      <td className="block text-xs sm:table-cell sm:px-4 sm:py-2.5 sm:text-sm">
                        <Link
                          to={`/projekt/${e.projectId}?flik=utgifter`}
                          className="text-brand-700 hover:underline"
                        >
                          {e.projectTitle}
                        </Link>
                      </td>
                      <td className="hidden text-muted sm:table-cell sm:px-4 sm:py-2.5">
                        {EXPENSE_CATEGORY_LABELS[e.category]}
                      </td>
                      <td className="block text-right font-semibold tabular-nums sm:table-cell sm:px-4 sm:py-2.5 sm:whitespace-nowrap">
                        {formatSek(e.amountOre)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
