import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowRight, Download, FileText } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS, type Stats } from '@reno/shared';
import { searchQuery, useProjects, useStats } from '../api/hooks.ts';
import { BarList, ColumnChart } from '../components/charts.tsx';
import { UpcomingCard } from '../components/UpcomingCard.tsx';
import { BudgetBar, Card, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/ui.tsx';
import { formatSek } from '../lib/format.ts';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function BudgetList({ projects }: { projects: Stats['projects'] }) {
  const withBudget = projects.filter((p) => p.budgetOre > 0);
  if (withBudget.length === 0) {
    return <p className="text-sm text-muted">Inga projekt med budget i perioden.</p>;
  }
  return (
    <ul className="space-y-4">
      {withBudget.map((p) => {
        const over = p.spentOre > p.budgetOre;
        return (
          <li key={p.id}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link
                to={`/projekt/${p.id}`}
                className="flex items-center gap-2 text-sm font-medium hover:text-brand-700"
              >
                {p.title} <StatusBadge status={p.status} />
              </Link>
              <span className="text-sm tabular-nums">
                {formatSek(p.spentOre)}{' '}
                <span className="text-muted">av {formatSek(p.budgetOre)}</span>
              </span>
            </div>
            <BudgetBar spent={p.spentOre} budget={p.budgetOre} />
            {over && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
                <AlertTriangle className="size-3.5" aria-hidden />
                Över budget med {formatSek(p.spentOre - p.budgetOre)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RotBasis({ stats }: { stats: Stats }) {
  if (stats.year === null) {
    return (
      <p className="text-sm text-muted">
        ROT-avdrag räknas per år – välj ett år ovan för att se underlaget.
      </p>
    );
  }
  if (stats.labor.totalOre === 0) {
    return <p className="text-sm text-muted">Inga arbetskostnader registrerade {stats.year}.</p>;
  }
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="pb-1.5 font-medium">Utförare</th>
            <th className="pb-1.5 font-medium">Org.nr</th>
            <th className="pb-1.5 text-right font-medium">Arbetskostnad</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {stats.labor.byContractor.map((c) => (
            <tr key={`${c.contractorId}-${c.name}`}>
              <td className="py-1.5">{c.name}</td>
              <td className="py-1.5 text-muted">{c.orgNumber ?? '–'}</td>
              <td className="py-1.5 text-right tabular-nums">{formatSek(c.amountOre)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold">
            <td className="pt-1.5" colSpan={2}>
              Summa {stats.year}
            </td>
            <td className="pt-1.5 text-right tabular-nums">{formatSek(stats.labor.totalOre)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted">
        Underlaget är summan av utgifter i kategorin Arbetskostnad. Avdraget gäller bara arbete –
        inte material eller resor – och dras oftast direkt på hantverkarens faktura. Procentsats och
        tak ändras över tid; kontrollera aktuella regler hos{' '}
        <a
          href="https://www.skatteverket.se/rotochrut"
          target="_blank"
          rel="noreferrer"
          className="text-brand-700 hover:underline"
        >
          Skatteverket
        </a>
        .
      </p>
    </div>
  );
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const allTime = useStats();
  const projects = useProjects();
  const currentYear = new Date().getFullYear();
  const years = allTime.data?.years ?? [];

  // Standard: innevarande år om det finns utgifter då, annars senaste året med utgifter.
  const param = params.get('ar');
  const year =
    param === 'alla'
      ? undefined
      : param
        ? Number(param)
        : years.includes(currentYear)
          ? currentYear
          : years[0];
  const stats = useStats(year);

  if (allTime.error || stats.error) return <ErrorBox error={allTime.error ?? stats.error} />;
  if (!allTime.data || !stats.data || !projects.data) return <Spinner />;

  if (projects.data.length === 0) {
    return (
      <>
        <PageHeader title="Översikt" />
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Välkommen!</h2>
          <p className="mt-1 text-sm text-muted">Tre steg för att komma igång:</p>
          <ol className="mt-4 space-y-2">
            {[
              { to: '/rum', title: 'Lägg till husets rum', text: 'Kök, badrum, sovrum…' },
              {
                to: '/projekt',
                title: 'Skapa ditt första projekt',
                text: 'Något du gjort eller ska göra, med budget om du vill.',
              },
              {
                to: '/utgifter',
                title: 'Fota ett kvitto',
                text: 'Spara det direkt, fyll i uppgifterna när du har tid.',
              },
            ].map((step, i) => (
              <li key={step.to}>
                <Link
                  to={step.to}
                  className="flex items-center gap-3 rounded-lg border border-line p-3 hover:bg-canvas"
                >
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{step.title}</span>
                    <span className="block text-sm text-muted">{step.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </>
    );
  }

  const s = stats.data;
  const period = s.year ? String(s.year) : 'alla år';
  const ongoing = projects.data.filter((p) => p.status === 'pagaende');
  const range = s.year ? { from: `${s.year}-01-01`, to: `${s.year}-12-31` } : {};

  return (
    <>
      <PageHeader
        title="Översikt"
        subtitle="Läget för renoveringarna i huset."
        actions={
          <>
            <label htmlFor="year" className="sr-only">
              Period
            </label>
            <select
              id="year"
              value={s.year ?? 'alla'}
              onChange={(e) => setParams({ ar: e.target.value }, { replace: true })}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="alla">Alla år</option>
            </select>
            <Link
              to="/rapport"
              className="hidden h-10 items-center gap-1.5 sm:inline-flex rounded-lg border border-line bg-surface px-4 text-sm font-medium shadow-sm hover:bg-canvas"
            >
              <FileText className="size-4" aria-hidden /> Rapport
            </Link>
            <Link
              to="/forsaljning"
              className="hidden h-10 items-center gap-1.5 sm:inline-flex rounded-lg border border-line bg-surface px-4 text-sm font-medium shadow-sm hover:bg-canvas"
            >
              Försäljningsunderlag
            </Link>
          </>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label={`Spenderat ${period}`}
            value={formatSek(s.totalOre)}
            sub={`${s.expenseCount} utgifter`}
          />
          <Tile
            label="Varav arbetskostnad"
            value={formatSek(s.labor.totalOre)}
            sub={
              s.totalOre
                ? `${Math.round((s.labor.totalOre / s.totalOre) * 100)} % av perioden`
                : undefined
            }
          />
          <Tile
            label="Pågående projekt"
            value={String(ongoing.length)}
            sub={ongoing.map((p) => p.title).join(', ') || undefined}
          />
          <Tile
            label="Totalt sedan start"
            value={formatSek(allTime.data.totalOre)}
            sub={`${projects.data.length} projekt`}
          />
        </div>

        <UpcomingCard />

        {s.series.length > 0 && (
          <Card className="p-4">
            <ColumnChart
              data={s.series}
              title={s.year ? `Utgifter per månad ${s.year}` : 'Utgifter per år'}
            />
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Per kategori">
            {s.totalOre ? (
              <BarList
                items={s.byCategory
                  .filter((c) => c.amountOre > 0)
                  .sort((a, b) => b.amountOre - a.amountOre)
                  .map((c) => ({
                    key: c.category,
                    label: EXPENSE_CATEGORY_LABELS[c.category],
                    amountOre: c.amountOre,
                  }))}
              />
            ) : (
              <p className="text-sm text-muted">Inga utgifter {period}.</p>
            )}
          </Section>
          <Section
            title="Per rum"
            action={
              <Link
                to="/rum"
                className="flex items-center gap-1 text-sm text-brand-700 hover:underline"
              >
                Alla rum <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            {s.byRoom.length ? (
              <BarList
                items={s.byRoom.map((r) => ({
                  key: String(r.roomId),
                  label: r.name,
                  amountOre: r.amountOre,
                  href: r.roomId ? `/rum/${r.roomId}` : undefined,
                }))}
              />
            ) : (
              <p className="text-sm text-muted">Inga utgifter {period}.</p>
            )}
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Budget mot utfall">
            <BudgetList projects={s.projects} />
          </Section>
          <Section
            title={`Underlag för ROT-avdrag${s.year ? ` ${s.year}` : ''}`}
            action={
              s.year && s.labor.totalOre > 0 ? (
                <a
                  href={`/api/export/expenses.csv?${searchQuery({ ...range, category: 'arbete' })}`}
                  download
                  className="flex items-center gap-1 text-sm text-brand-700 hover:underline"
                >
                  <Download className="size-3.5" aria-hidden /> CSV
                </a>
              ) : undefined
            }
          >
            <RotBasis stats={s} />
          </Section>
        </div>

        <div className="flex flex-wrap justify-end gap-4 text-sm">
          <Link to={`/utgifter?${searchQuery(range)}`} className="text-brand-700 hover:underline">
            Visa utgifterna för {period}
          </Link>
          <a
            href={`/api/export/expenses.csv?${searchQuery(range)}`}
            download
            className="flex items-center gap-1 text-brand-700 hover:underline"
          >
            <Download className="size-3.5" aria-hidden /> Exportera {period} som CSV
          </a>
        </div>
      </div>
    </>
  );
}
