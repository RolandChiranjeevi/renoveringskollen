import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, Hammer, Plus } from 'lucide-react';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
  type ProjectSummary,
  type RoomListItem,
} from '@reno/shared';
import { useProjects, useRooms } from '../api/hooks.ts';
import { Modal } from '../components/Modal.tsx';
import {
  BudgetBar,
  Button,
  Card,
  cx,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
} from '../components/ui.tsx';
import { ProjectForm } from '../forms/ProjectForm.tsx';
import { formatDate, formatSek } from '../lib/format.ts';

export function ProjectCard({
  project,
  rooms,
}: {
  project: ProjectSummary;
  rooms: RoomListItem[];
}) {
  const roomNames = project.roomIds
    .map((id) => rooms.find((r) => r.id === id)?.name)
    .filter(Boolean);
  return (
    <Link to={`/projekt/${project.id}`} className="group block">
      <Card className="h-full p-4 transition-shadow group-hover:shadow-md">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-semibold group-hover:text-brand-700">{project.title}</h3>
          <StatusBadge status={project.status} />
        </div>
        {roomNames.length > 0 && <p className="mb-3 text-sm text-muted">{roomNames.join(' · ')}</p>}
        {/* Radbryts snyggt i smala kolumner (t.ex. på rumssidan) i stället för mitt i beloppet. */}
        {(project.spentOre > 0 || project.budgetOre > 0) && (
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-medium whitespace-nowrap tabular-nums">
              {formatSek(project.spentOre)}
            </span>
            {project.budgetOre > 0 && (
              <span className="whitespace-nowrap text-muted tabular-nums">
                av {formatSek(project.budgetOre)}
              </span>
            )}
          </div>
        )}
        <BudgetBar spent={project.spentOre} budget={project.budgetOre} />
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          {project.startDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatDate(project.startDate)}
            </span>
          )}
          {project.taskCount > 0 && (
            <span>
              {project.tasksDone}/{project.taskCount} uppgifter klara
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const status = (PROJECT_STATUSES as readonly string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as ProjectStatus)
    : undefined;
  const projects = useProjects({ status });
  const rooms = useRooms();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const filters: { value?: ProjectStatus; label: string }[] = [
    { label: 'Alla' },
    ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] })),
  ];

  return (
    <>
      <PageHeader
        title="Projekt"
        subtitle="Allt du gjort och planerar att göra i huset."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Nytt projekt
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filtrera på status">
        {filters.map((f) => (
          <button
            key={f.label}
            role="tab"
            aria-selected={status === f.value}
            onClick={() => setParams(f.value ? { status: f.value } : {})}
            className={cx(
              'rounded-full px-3 py-1 text-sm font-medium',
              status === f.value
                ? 'bg-ink text-surface'
                : 'bg-surface text-muted ring-1 ring-line hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <QueryState query={projects}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              icon={<Hammer className="size-6" />}
              title={status ? 'Inga projekt med den statusen' : 'Inga projekt ännu'}
            >
              {!status && 'Skapa ditt första renoveringsprojekt för att börja logga.'}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} rooms={rooms.data ?? []} />
              ))}
            </div>
          )
        }
      </QueryState>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nytt projekt">
        <ProjectForm
          onDone={(saved) => {
            setCreating(false);
            if (saved) navigate(`/projekt/${saved.id}`);
          }}
        />
      </Modal>
    </>
  );
}
