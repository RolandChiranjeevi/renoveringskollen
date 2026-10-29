import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import {
  MATERIAL_SURFACES,
  MATERIAL_SURFACE_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_KINDS,
  type SaleReport,
} from '@reno/shared';
import { attachmentUrl } from '../api/client.ts';
import { useSaleReport } from '../api/hooks.ts';
import { ColorSwatch, materialDetails } from '../components/MaterialsPanel.tsx';
import { Button, QueryState } from '../components/ui.tsx';
import { formatDate, formatSek } from '../lib/format.ts';

// Försäljningsunderlag: "Skriv ut / spara som PDF" i webbläsaren.
// Del 1 är för köparen (vad som gjorts, material, garantier), del 2 för deklarationen (summor per år och typ).

type SaleProject = SaleReport['projects'][number];

const period = (p: { startDate: string | null; endDate: string | null }) =>
  p.startDate || p.endDate
    ? `${formatDate(p.startDate)} – ${p.endDate ? formatDate(p.endDate) : 'pågår'}`
    : '–';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page border-t border-line pt-6">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const th = 'py-1 pr-3 text-left text-xs font-medium text-muted';
const td = 'py-1.5 pr-3 align-top';
const num = 'py-1.5 text-right align-top whitespace-nowrap tabular-nums';

/** Alla före/efter-par för projektet, med bildtext. Varje par hålls ihop när dokumentet skrivs ut. */
function Photos({ p }: { p: SaleProject }) {
  if (p.photoPairs.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {p.photoPairs.map(({ before, after }) => (
        <div key={before.id} className="grid grid-cols-2 gap-2 break-inside-avoid">
          {[
            { photo: before, label: 'Före' },
            { photo: after, label: 'Efter' },
          ].map(({ photo, label }) => (
            <figure key={label}>
              <img
                src={attachmentUrl(photo.id)}
                alt={photo.caption ?? `${p.title}, ${label.toLowerCase()}`}
                className="aspect-[4/3] w-full rounded-md object-cover ring-1 ring-line"
              />
              <figcaption className="mt-0.5 text-xs text-muted">
                <span className="font-medium">{label}</span>
                {photo.caption && ` · ${photo.caption}`}
              </figcaption>
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SalePage() {
  const report = useSaleReport();

  return (
    <QueryState query={report}>
      {(r) => {
        const years = r.byYear.map((y) => y.year);
        const span = years.length
          ? years[0] === years.at(-1)
            ? String(years[0])
            : `${years[0]}–${years.at(-1)}`
          : null;
        const roomsWithMaterials = r.rooms.filter((room) => room.materials.length > 0);
        const sum = (k: keyof SaleReport['byYear'][number]['byKind']) =>
          r.byYear.reduce((s, y) => s + y.byKind[k], 0);

        return (
          <article className="mx-auto max-w-3xl rounded-xl bg-surface p-6 text-sm shadow-sm ring-1 ring-line sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <Link
                to="/rapport"
                className="inline-flex items-center gap-1 text-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" aria-hidden /> Rapport
              </Link>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden /> Skriv ut / spara som PDF
              </Button>
            </div>

            <header className="mb-8">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Försäljningsunderlag
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Husets renoveringshistorik
              </h1>
              <p className="mt-1 text-muted">Sammanställd {formatDate(r.generatedAt)}</p>
            </header>

            {r.projects.length === 0 ? (
              <p className="text-muted">Inga projekt registrerade ännu.</p>
            ) : (
              <div className="space-y-8">
                <section>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      ['Totalt investerat', formatSek(r.totalOre)],
                      ['Varav förbättringar', formatSek(sum('forbattring'))],
                      ['Projekt', String(r.projects.length)],
                      ['Period', span ?? '–'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className="text-lg font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <Section title="Genomförda projekt">
                  <table className="w-full">
                    <thead className="border-b border-line">
                      <tr>
                        <th className={th}>Projekt</th>
                        <th className={th}>Typ</th>
                        <th className={th}>Period</th>
                        <th className={th}>Utfört av</th>
                        <th className={`${th} pr-0 text-right`}>Kostnad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {r.projects.map((p) => (
                        <Fragment key={p.id}>
                          <tr className="break-inside-avoid">
                            <td className={td}>
                              <span className="font-medium">{p.title}</span>
                              {p.roomNames.length > 0 && (
                                <span className="block text-xs text-muted">
                                  {p.roomNames.join(', ')}
                                </span>
                              )}
                            </td>
                            <td className={td}>{PROJECT_KIND_LABELS[p.kind]}</td>
                            <td className={`${td} whitespace-nowrap text-muted`}>{period(p)}</td>
                            <td className={td}>
                              {p.performedBy.length ? p.performedBy.join(', ') : 'Eget arbete'}
                            </td>
                            <td className={num}>
                              {formatSek(p.spentOre)}
                              {p.laborOre > 0 && (
                                <span className="block text-xs text-muted">
                                  varav arbete {formatSek(p.laborOre)}
                                </span>
                              )}
                            </td>
                          </tr>
                          {/* Bilderna får hela bredden under projektraden i stället för den smala projektkolumnen. */}
                          {p.photoPairs.length > 0 && (
                            <tr>
                              <td colSpan={5} className="pb-4">
                                <Photos p={p} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </Section>

                {roomsWithMaterials.length > 0 && (
                  <Section title="Material och färger per rum">
                    <div className="grid gap-6 sm:grid-cols-2">
                      {roomsWithMaterials.map((room) => (
                        <div key={room.id} className="break-inside-avoid">
                          <h3 className="mb-1.5 font-semibold">{room.name}</h3>
                          <dl className="space-y-1.5">
                            {MATERIAL_SURFACES.map((s) => {
                              const items = room.materials.filter((m) => m.surface === s);
                              if (items.length === 0) return null;
                              return (
                                <div key={s} className="grid grid-cols-[6rem_1fr] gap-2">
                                  <dt className="text-muted">{MATERIAL_SURFACE_LABELS[s]}</dt>
                                  <dd className="space-y-1">
                                    {items.map((m) => (
                                      <p key={m.id} className="flex items-start gap-1.5">
                                        <ColorSwatch
                                          hex={m.colorHex}
                                          code={m.colorCode}
                                          label={m.colorCode ?? m.name}
                                        />
                                        <span>
                                          {m.name}
                                          {materialDetails(m) && (
                                            <span className="text-muted">
                                              {' – '}
                                              {/* Varje uppgift hålls ihop, så att t.ex. en kulörkod inte bryts mitt i. */}
                                              {materialDetails(m)
                                                .split(' · ')
                                                .map((part, i) => (
                                                  <span key={i} className="whitespace-nowrap">
                                                    {i > 0 && ' · '}
                                                    {part}
                                                  </span>
                                                ))}
                                            </span>
                                          )}
                                        </span>
                                      </p>
                                    ))}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {r.warranties.length > 0 && (
                  <Section title="Garantier">
                    <table className="w-full">
                      <thead className="border-b border-line">
                        <tr>
                          <th className={th}>Projekt</th>
                          <th className={th}>Utförare</th>
                          <th className={`${th} pr-0 text-right`}>Gäller till</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {r.warranties.map((w) => (
                          <tr key={w.projectId}>
                            <td className={td}>{w.title}</td>
                            <td className={td}>{w.contractorName ?? '–'}</td>
                            <td className={num}>
                              {formatDate(w.warrantyUntil)}{' '}
                              <span className={w.active ? 'text-brand-700' : 'text-muted'}>
                                ({w.active ? 'gäller' : 'utgången'})
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                {r.contractors.length > 0 && (
                  <Section title="Anlitade hantverkare">
                    <table className="w-full">
                      <thead className="border-b border-line">
                        <tr>
                          <th className={th}>Firma</th>
                          <th className={th}>Org.nr</th>
                          <th className={th}>Kontakt</th>
                          <th className={th}>Projekt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {r.contractors.map((c) => (
                          <tr key={c.id}>
                            <td className={`${td} font-medium`}>{c.name}</td>
                            <td className={`${td} whitespace-nowrap`}>{c.orgNumber ?? '–'}</td>
                            <td className={td}>
                              {[c.phone, c.email].filter(Boolean).join(', ') || '–'}
                            </td>
                            <td className={td}>{c.projectTitles.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                <Section title="Underlag för deklarationen">
                  <table className="w-full">
                    <thead className="border-b border-line">
                      <tr>
                        <th className={th}>År</th>
                        {PROJECT_KINDS.map((k) => (
                          <th key={k} className={`${th} text-right`}>
                            {PROJECT_KIND_LABELS[k]}
                          </th>
                        ))}
                        <th className={`${th} text-right`}>Varav arbete</th>
                        <th className={`${th} pr-0 text-right`}>Totalt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {r.byYear.map((y) => (
                        <tr key={y.year}>
                          <td className={td}>{y.year}</td>
                          {PROJECT_KINDS.map((k) => (
                            <td key={k} className={`${num} pr-3`}>
                              {y.byKind[k] ? formatSek(y.byKind[k]) : '–'}
                            </td>
                          ))}
                          <td className={`${num} pr-3 text-muted`}>
                            {y.laborOre ? formatSek(y.laborOre) : '–'}
                          </td>
                          <td className={`${num} font-medium`}>{formatSek(y.totalOre)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-ink/30 font-semibold">
                        <td className="pt-1.5">Summa</td>
                        {PROJECT_KINDS.map((k) => (
                          <td key={k} className="pt-1.5 pr-3 text-right tabular-nums">
                            {sum(k) ? formatSek(sum(k)) : '–'}
                          </td>
                        ))}
                        <td className="pt-1.5 pr-3 text-right tabular-nums">
                          {r.byYear.some((y) => y.laborOre)
                            ? formatSek(r.byYear.reduce((s, y) => s + y.laborOre, 0))
                            : '–'}
                        </td>
                        <td className="pt-1.5 text-right tabular-nums">{formatSek(r.totalOre)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="mt-3 text-xs text-muted">
                    Beloppen är summor av registrerade utgifter, fördelade efter hur varje projekt
                    märkts (förbättring, underhåll eller reparation). Underlaget är ingen
                    skatteberäkning: vilka utgifter som får dras av vid försäljning, under vilka år
                    och med vilka beloppsgränser avgörs av Skatteverkets regler – kontrollera dem på{' '}
                    <a
                      href="https://www.skatteverket.se"
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 hover:underline"
                    >
                      skatteverket.se
                    </a>{' '}
                    eller med en rådgivare. Spara originalkvitton och fakturor.
                  </p>
                </Section>
              </div>
            )}
          </article>
        );
      }}
    </QueryState>
  );
}
