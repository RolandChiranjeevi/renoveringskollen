import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PROJECT_KIND_LABELS, type ProjectDetail } from '@reno/shared';
import { useRooms } from '../../api/hooks.ts';
import { Card } from '../../components/ui.tsx';
import { formatDate } from '../../lib/format.ts';
import { CategoryBudgets } from './CategoryBudgets.tsx';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OverviewTab({ project: p }: { project: ProjectDetail }) {
  const rooms = useRooms();
  const projectRooms = (rooms.data ?? []).filter((r) => p.roomIds.includes(r.id));
  const warrantyActive =
    p.warrantyUntil && p.warrantyUntil >= new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">Beskrivning</h2>
        {p.description ? (
          <p className="text-sm whitespace-pre-wrap">{p.description}</p>
        ) : (
          <p className="text-sm text-muted">
            Ingen beskrivning. Klicka på Redigera för att lägga till.
          </p>
        )}
      </Card>
      <Card className="p-4">
        <dl className="divide-y divide-line">
          <Row label="Rum">
            {projectRooms.length ? (
              <span className="flex flex-wrap gap-x-2">
                {projectRooms.map((r) => (
                  <Link key={r.id} to={`/rum/${r.id}`} className="text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                ))}
              </span>
            ) : (
              '–'
            )}
          </Row>
          <Row label="Typ">{PROJECT_KIND_LABELS[p.kind]}</Row>
          <Row label="Start">{formatDate(p.startDate)}</Row>
          <Row label="Klart">{formatDate(p.endDate)}</Row>
          <Row label="Utfört av">
            {p.performedBy.length ? p.performedBy.join(', ') : 'Eget arbete'}
          </Row>
          {p.contractor && (p.contractor.phone || p.contractor.email) && (
            <Row label="Kontakt">
              <span className="flex flex-wrap gap-x-3">
                {p.contractor.phone && (
                  <a href={`tel:${p.contractor.phone}`} className="text-brand-700 hover:underline">
                    {p.contractor.phone}
                  </a>
                )}
                {p.contractor.email && (
                  <a
                    href={`mailto:${p.contractor.email}`}
                    className="text-brand-700 hover:underline break-all"
                  >
                    {p.contractor.email}
                  </a>
                )}
              </span>
            </Row>
          )}
          <Row label="Garanti till">
            {p.warrantyUntil ? (
              <span className={warrantyActive ? 'text-brand-700' : 'text-muted'}>
                {formatDate(p.warrantyUntil)} {warrantyActive ? '(gäller)' : '(utgången)'}
              </span>
            ) : (
              '–'
            )}
          </Row>
        </dl>
      </Card>
      <div className="lg:col-span-2">
        <CategoryBudgets projectId={p.id} />
      </div>
    </div>
  );
}
