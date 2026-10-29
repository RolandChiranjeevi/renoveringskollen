import { Link } from 'react-router';
import { ArrowLeft, Check, Printer } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS, PROJECT_STATUS_LABELS, type Report } from '@reno/shared';
import { useReport } from '../api/hooks.ts';
import { Button, QueryState } from '../components/ui.tsx';
import { formatDate, formatSek } from '../lib/format.ts';

// Utskrivbar renoveringshistorik – "Skriv ut" i webbläsaren kan spara som PDF.
// Tänkt att bifogas vid försäljning eller sparas som dokumentation av huset.

type ReportProject = Report['projects'][number];

const period = (p: ReportProject) =>
  p.startDate || p.endDate
    ? `${formatDate(p.startDate)} – ${p.endDate ? formatDate(p.endDate) : 'pågår'}`
    : '–';

function ProjectSection({ p, report }: { p: ReportProject; report: Report }) {
  const rooms = report.rooms.filter((r) => p.roomIds.includes(r.id)).map((r) => r.name);
  const contractor = report.contractors.find((c) => c.id === p.contractorId);
  const roomName = (id: number | null) => report.rooms.find((r) => r.id === id)?.name;

  return (
    <section className="break-inside-avoid-page border-t border-line pt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{p.title}</h2>
        <span className="text-sm text-muted">{PROJECT_STATUS_LABELS[p.status]}</span>
      </div>
      <dl className="mb-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Period</dt>
        <dd>{period(p)}</dd>
        <dt className="text-muted">Rum</dt>
        <dd>{rooms.join(', ') || '–'}</dd>
        <dt className="text-muted">Utfört av</dt>
        <dd>
          {p.performedBy.length ? p.performedBy.join(', ') : 'Eget arbete'}
          {contractor && (contractor.orgNumber || contractor.phone) && (
            <span className="block text-muted">
              {[
                contractor.name,
                contractor.orgNumber && `org.nr ${contractor.orgNumber}`,
                contractor.phone,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </dd>
        {p.warrantyUntil && (
          <>
            <dt className="text-muted">Garanti till</dt>
            <dd>{formatDate(p.warrantyUntil)}</dd>
          </>
        )}
        <dt className="text-muted">Kostnad</dt>
        <dd className="font-medium">
          {formatSek(p.spentOre)}
          {p.budgetOre > 0 && (
            <span className="font-normal text-muted"> (budget {formatSek(p.budgetOre)})</span>
          )}
        </dd>
      </dl>
      {p.description && <p className="mb-4 text-sm whitespace-pre-wrap">{p.description}</p>}

      {p.expenses.length > 0 && (
        <table className="mb-4 w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Datum</th>
              <th className="py-1 pr-3 font-medium">Vad</th>
              <th className="py-1 pr-3 font-medium">Butik/firma</th>
              <th className="py-1 pr-3 font-medium">Kategori</th>
              <th className="py-1 text-right font-medium">Belopp</th>
              <th className="py-1 pl-2 text-center font-medium">Kvitto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.expenses.map((e) => (
              <tr key={e.id} className="break-inside-avoid">
                <td className="py-1 pr-3 whitespace-nowrap tabular-nums">{e.date}</td>
                <td className="py-1 pr-3">
                  {e.description}
                  {rooms.length > 1 && roomName(e.roomId) && (
                    <span className="text-muted"> · {roomName(e.roomId)}</span>
                  )}
                </td>
                <td className="py-1 pr-3">{e.store ?? ''}</td>
                <td className="py-1 pr-3">{EXPENSE_CATEGORY_LABELS[e.category]}</td>
                <td className="py-1 text-right whitespace-nowrap tabular-nums">
                  {formatSek(e.amountOre)}
                </td>
                <td className="py-1 pl-2 text-center">
                  {e.attachmentCount > 0 && <Check className="inline size-3.5" aria-label="Ja" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {p.tasksCompleted.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-xs font-medium text-muted">Utfört</h3>
          <ul className="list-inside list-disc space-y-0.5">
            {p.tasksCompleted.map((t) => (
              <li key={t.id}>
                {t.title}
                {t.completedAt && (
                  <span className="text-muted"> ({formatDate(t.completedAt)})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ReportPage() {
  const report = useReport();

  return (
    <QueryState query={report}>
      {(r) => (
        <article className="mx-auto max-w-3xl rounded-xl bg-surface p-6 shadow-sm ring-1 ring-line sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden /> Översikt
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/forsaljning"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium shadow-sm hover:bg-canvas"
              >
                Försäljningsunderlag
              </Link>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden /> Skriv ut / spara som PDF
              </Button>
            </div>
          </div>

          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">Renoveringshistorik</h1>
            <p className="mt-1 text-sm text-muted">Sammanställd {formatDate(r.generatedAt)}</p>
          </header>

          {r.projects.length === 0 ? (
            <p className="text-sm text-muted">Inga projekt registrerade.</p>
          ) : (
            <>
              <section className="mb-8">
                <h2 className="mb-2 text-sm font-semibold text-muted">Sammanfattning</h2>
                <table className="w-full text-sm">
                  <thead className="border-b border-line text-left text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Projekt</th>
                      <th className="py-1 pr-3 font-medium">Period</th>
                      <th className="py-1 pr-3 font-medium">Utfört av</th>
                      <th className="py-1 text-right font-medium">Kostnad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.projects.map((p) => (
                      <tr key={p.id}>
                        <td className="py-1.5 pr-3 font-medium">{p.title}</td>
                        <td className="py-1.5 pr-3 text-muted">{period(p)}</td>
                        <td className="py-1.5 pr-3">
                          {p.performedBy.length ? p.performedBy.join(', ') : 'Eget arbete'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatSek(p.spentOre)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/30 font-semibold">
                      <td className="pt-1.5" colSpan={3}>
                        Totalt
                      </td>
                      <td className="pt-1.5 text-right tabular-nums">{formatSek(r.totalOre)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              <div className="space-y-8">
                {r.projects.map((p) => (
                  <ProjectSection key={p.id} p={p} report={r} />
                ))}
              </div>
            </>
          )}
        </article>
      )}
    </QueryState>
  );
}
