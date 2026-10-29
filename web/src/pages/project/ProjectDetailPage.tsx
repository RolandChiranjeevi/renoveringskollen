import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useDeleteProject, useProject } from '../../api/hooks.ts';
import { NotesPanel } from '../../components/NotesPanel.tsx';
import { PhotoGallery } from '../../components/AttachmentGallery.tsx';
import { Modal } from '../../components/Modal.tsx';
import {
  BudgetBar,
  Button,
  Card,
  cx,
  ErrorBox,
  PageHeader,
  QueryState,
  StatusBadge,
} from '../../components/ui.tsx';
import { ProjectForm } from '../../forms/ProjectForm.tsx';
import { formatSek } from '../../lib/format.ts';
import { NotFoundPage } from '../NotFoundPage.tsx';
import { ExpensesTab } from './ExpensesTab.tsx';
import { OverviewTab } from './OverviewTab.tsx';
import { QuotesTab } from './QuotesTab.tsx';
import { TasksTab } from './TasksTab.tsx';

const TABS = [
  { id: 'oversikt', label: 'Översikt' },
  { id: 'utgifter', label: 'Utgifter' },
  { id: 'uppgifter', label: 'Uppgifter' },
  { id: 'offerter', label: 'Offerter' },
  { id: 'bilder', label: 'Bilder' },
  { id: 'anteckningar', label: 'Anteckningar' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('text-lg font-semibold tabular-nums', tone === 'danger' && 'text-danger')}>
        {value}
      </p>
    </div>
  );
}

export function ProjectDetailPage() {
  const id = Number(useParams().id);
  const project = useProject(id);
  const remove = useDeleteProject();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get('flik'))?.id ?? 'oversikt';
  const [editing, setEditing] = useState(false);

  if (project.error && 'status' in project.error && project.error.status === 404)
    return <NotFoundPage />;

  return (
    <QueryState query={project}>
      {(p) => {
        const remaining = p.budgetOre - p.spentOre;
        return (
          <>
            <Link
              to="/projekt"
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink pointer-coarse:py-3"
            >
              <ArrowLeft className="size-4" aria-hidden /> Alla projekt
            </Link>
            <PageHeader
              title={
                <span className="flex flex-wrap items-center gap-3">
                  {p.title} <StatusBadge status={p.status} />
                </span>
              }
              actions={
                <>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" aria-hidden /> Redigera
                  </Button>
                  <Button
                    variant="danger"
                    aria-label="Ta bort projekt"
                    onClick={() =>
                      confirm(
                        `Ta bort ”${p.title}” med alla utgifter, uppgifter, bilder och kvitton? Det går inte att ångra.`,
                      ) && remove.mutate(p.id, { onSuccess: () => navigate('/projekt') })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              }
            />
            {remove.error && <ErrorBox error={remove.error} />}

            <Card className="mb-6 p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Spenderat" value={formatSek(p.spentOre)} />
                <Stat label="Budget" value={p.budgetOre ? formatSek(p.budgetOre) : '–'} />
                <Stat
                  label={remaining < 0 ? 'Över budget' : 'Kvar av budget'}
                  value={p.budgetOre ? formatSek(Math.abs(remaining)) : '–'}
                  tone={remaining < 0 ? 'danger' : undefined}
                />
                <Stat
                  label="Uppgifter klara"
                  value={p.taskCount ? `${p.tasksDone} av ${p.taskCount}` : '–'}
                />
              </div>
              {p.budgetOre > 0 && (
                <div className="mt-4">
                  <BudgetBar spent={p.spentOre} budget={p.budgetOre} />
                </div>
              )}
            </Card>

            <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div role="tablist" className="flex min-w-max gap-1 border-b border-line">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() =>
                      setParams(t.id === 'oversikt' ? {} : { flik: t.id }, { replace: true })
                    }
                    className={cx(
                      '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors pointer-coarse:py-3.5',
                      tab === t.id
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div role="tabpanel">
              {tab === 'oversikt' && <OverviewTab project={p} />}
              {tab === 'utgifter' && <ExpensesTab project={p} />}
              {tab === 'uppgifter' && <TasksTab projectId={p.id} />}
              {tab === 'offerter' && <QuotesTab projectId={p.id} />}
              {tab === 'bilder' && <PhotoGallery owner={{ projectId: p.id }} />}
              {tab === 'anteckningar' && <NotesPanel owner={{ projectId: p.id }} />}
            </div>

            <Modal open={editing} onClose={() => setEditing(false)} title="Redigera projekt">
              <ProjectForm project={p} onDone={() => setEditing(false)} />
            </Modal>
          </>
        );
      }}
    </QueryState>
  );
}
