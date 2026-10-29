import { Link } from 'react-router';
import { AlertTriangle, CalendarClock, ShieldCheck, Wrench } from 'lucide-react';
import { TASK_PRIORITY_LABELS } from '@reno/shared';
import { useUpcoming } from '../api/hooks.ts';
import { formatDate } from '../lib/format.ts';
import { useHiddenIds } from '../lib/undoDelete.tsx';
import { Card, cx } from './ui.tsx';

/** "3 dagar försenad", "idag", "imorgon", "om 12 dagar". */
export function whenText(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft} ${daysLeft === -1 ? 'dag' : 'dagar'} försenad`;
  if (daysLeft === 0) return 'idag';
  if (daysLeft === 1) return 'imorgon';
  return `om ${daysLeft} dagar`;
}

/**
 * "Kommande" på översikten: försenade och snart förfallande uppgifter samt garantier som löper ut.
 * Ofarlig sida: visas ingenting alls om hämtningen misslyckas, så att resten av översikten inte påverkas.
 */
export function UpcomingCard() {
  const upcoming = useUpcoming();
  const hiddenTasks = useHiddenIds('task');
  const hiddenMaintenance = useHiddenIds('maintenance');
  const data = upcoming.data;
  if (!data) return null;

  const { warranties } = data;
  const tasks = data.tasks.filter((t) => !hiddenTasks.has(t.id));
  const maintenance = data.maintenance.filter((m) => !hiddenMaintenance.has(m.id));
  const nothing = tasks.length === 0 && warranties.length === 0 && maintenance.length === 0;

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Kommande</h2>
      {nothing ? (
        <p className="text-sm text-muted">
          Inget på gång: inga försenade uppgifter, inga uppgifter som förfaller den närmaste månaden
          inga underhållsjobb som är försenade eller snart ska göras och inga garantier som löper ut
          inom tre månader.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-6">
          {tasks.length > 0 && (
            <section aria-labelledby="upcoming-tasks">
              <h3
                id="upcoming-tasks"
                className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                Uppgifter
              </h3>
              <ul className="divide-y divide-line">
                {tasks.map((t) => {
                  const overdue = t.daysLeft < 0;
                  return (
                    <li key={t.id}>
                      <Link
                        to={`/projekt/${t.projectId}?flik=uppgifter`}
                        className="flex items-start gap-3 py-2 hover:bg-canvas/60"
                      >
                        {overdue ? (
                          <AlertTriangle
                            className="mt-0.5 size-4 shrink-0 text-danger"
                            aria-hidden
                          />
                        ) : (
                          <CalendarClock
                            className="mt-0.5 size-4 shrink-0 text-muted"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-medium">{t.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {t.projectTitle}
                            {t.priority === 'hog' &&
                              ` · ${TASK_PRIORITY_LABELS[t.priority]} prioritet`}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span
                            className={cx(
                              'block font-medium',
                              overdue ? 'text-danger' : 'text-ink',
                            )}
                          >
                            {whenText(t.daysLeft)}
                          </span>
                          <span className="block text-muted">{formatDate(t.dueDate)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {maintenance.length > 0 && (
            <section aria-labelledby="upcoming-maintenance">
              <h3
                id="upcoming-maintenance"
                className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                Underhåll
              </h3>
              <ul className="divide-y divide-line">
                {maintenance.map((m) => {
                  const overdue = m.daysLeft < 0;
                  return (
                    <li key={m.id}>
                      <Link
                        to="/underhall"
                        className="flex items-start gap-3 py-2 hover:bg-canvas/60"
                      >
                        {overdue ? (
                          <AlertTriangle
                            className="mt-0.5 size-4 shrink-0 text-danger"
                            aria-hidden
                          />
                        ) : (
                          <Wrench className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-medium">{m.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {m.roomName ?? 'Hela huset'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span
                            className={cx(
                              'block font-medium',
                              overdue ? 'text-danger' : 'text-ink',
                            )}
                          >
                            {whenText(m.daysLeft)}
                          </span>
                          <span className="block text-muted">{formatDate(m.dueOn)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {warranties.length > 0 && (
            <section aria-labelledby="upcoming-warranties">
              <h3
                id="upcoming-warranties"
                className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                Garantier som löper ut
              </h3>
              <ul className="divide-y divide-line">
                {warranties.map((w) => (
                  <li key={w.projectId}>
                    <Link
                      to={`/projekt/${w.projectId}`}
                      className="flex items-start gap-3 py-2 hover:bg-canvas/60"
                    >
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-medium">{w.title}</span>
                        {w.contractorName && (
                          <span className="block truncate text-xs text-muted">
                            {w.contractorName}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <span className="block font-medium">{whenText(w.daysLeft)}</span>
                        <span className="block text-muted">{formatDate(w.warrantyUntil)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
