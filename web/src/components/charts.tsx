import { useId, useState } from 'react';
import { Link } from 'react-router';
import { formatSek } from '../lib/format.ts';
import { cx } from './ui.tsx';

// Enkla diagram med en serie: en färg, ingen legend (rubriken säger vad som visas),
// tooltip vid hovring/fokus och en tabellvy som alternativ.

const compactSek = new Intl.NumberFormat('sv-SE', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const axisLabel = (ore: number) => `${compactSek.format(ore / 100)} kr`;

/** Rundar upp till ett "snyggt" tal (1, 2, 2,5 eller 5 × 10^n) för y-axeln. */
export function niceMax(value: number): number {
  if (value <= 0) return 0;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= value)!;
  return step * exp;
}

export interface Datum {
  key: string;
  label: string;
  amountOre: number;
}

export function ColumnChart({ data, title }: { data: Datum[]; title: string }) {
  const [active, setActive] = useState<number>();
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.amountOre)));
  const ticks = max ? [max, max / 2, 0] : [0];

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="font-semibold">{title}</figcaption>
        <button
          type="button"
          className="text-xs text-muted hover:text-ink"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? 'Visa diagram' : 'Visa som tabell'}
        </button>
      </div>

      {showTable ? (
        <table id={tableId} className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">
                  {d.label}
                </th>
                <td className="py-1.5 text-right tabular-nums">{formatSek(d.amountOre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="grid grid-cols-[4rem_1fr] gap-x-2"
          onMouseLeave={() => setActive(undefined)}
        >
          {/* y-axel */}
          {/* Fast bredd: etiketterna är absolutpositionerade och bidrar annars inte till kolumnens bredd,
              så de hamnar utanför kortet. */}
          <div
            data-testid="y-axis"
            className="relative h-44 text-right text-[11px] text-muted tabular-nums"
            aria-hidden
          >
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                style={{ top: `${max ? (1 - t / max) * 100 : 100}%` }}
              >
                {axisLabel(t)}
              </span>
            ))}
          </div>
          <div className="relative h-44">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-line"
                style={{ top: `${max ? (1 - t / max) * 100 : 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5">
              {data.map((d, i) => {
                const pct = max ? (d.amountOre / max) * 100 : 0;
                return (
                  <button
                    key={d.key}
                    type="button"
                    className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(undefined)}
                    aria-label={`${d.label}: ${formatSek(d.amountOre)}`}
                  >
                    <span
                      className={cx(
                        'w-full max-w-6 rounded-t-[4px] transition-colors',
                        active === i ? 'bg-brand-700' : 'bg-brand-500',
                        d.amountOre > 0 && 'min-h-0.5',
                      )}
                      style={{ height: `${pct}%` }}
                    />
                    {active === i && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute z-10 -translate-y-2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-surface shadow-lg"
                        style={{ bottom: `${pct}%` }}
                      >
                        {d.label}:{' '}
                        <strong className="font-semibold">{formatSek(d.amountOre)}</strong>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div />
          <div className="mt-1 flex gap-0.5 text-[11px] text-muted" aria-hidden>
            {data.map((d, i) => (
              <span
                key={d.key}
                className={cx('flex-1 truncate text-center', active === i && 'text-ink')}
              >
                {/* Vid många staplar: visa var tredje etikett. */}
                {data.length > 14 && i % 3 !== 0 ? '' : d.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Liggande staplar med etikett och värde – för kategorier och rum. */
export function BarList({
  items,
}: {
  items: { key: string; label: string; amountOre: number; href?: string }[];
}) {
  const max = Math.max(0, ...items.map((i) => i.amountOre));
  const total = items.reduce((s, i) => s + i.amountOre, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const pct = max ? (it.amountOre / max) * 100 : 0;
        const share = total ? Math.round((it.amountOre / total) * 100) : 0;
        const label = <span className="truncate text-sm">{it.label}</span>;
        return (
          <li key={it.key} title={`${it.label}: ${formatSek(it.amountOre)} (${share} %)`}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              {it.href ? (
                <Link to={it.href} className="truncate hover:text-brand-700 hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="shrink-0 text-sm tabular-nums">
                {formatSek(it.amountOre)} <span className="text-xs text-muted">{share} %</span>
              </span>
            </div>
            <div className="h-2 rounded-r-[4px] bg-ink/10">
              <div className="h-full rounded-r-[4px] bg-brand-500" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
