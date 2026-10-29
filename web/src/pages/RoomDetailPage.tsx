import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import type { Measurement } from '@reno/shared';
import { useDeleteRoom, useProjects, useRoom, useRooms, useSaveMeasurement } from '../api/hooks.ts';
import { PhotoGallery } from '../components/AttachmentGallery.tsx';
import { MaterialsPanel } from '../components/MaterialsPanel.tsx';
import { Modal } from '../components/Modal.tsx';
import { NotesPanel } from '../components/NotesPanel.tsx';
import { Button, Card, EmptyState, ErrorBox, PageHeader, QueryState } from '../components/ui.tsx';
import { ProjectForm } from '../forms/ProjectForm.tsx';
import { RoomForm } from '../forms/RoomForm.tsx';
import { formatSek } from '../lib/format.ts';
import { useHiddenIds, useUndoableDelete } from '../lib/undoDelete.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';
import { ProjectCard } from './ProjectsPage.tsx';

function Measurements({ roomId, list }: { roomId: number; list: Measurement[] }) {
  const save = useSaveMeasurement();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('measurement');
  const visible = list.filter((m) => !hidden.has(m.id));
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('m²');
  // Formuläret visas först när man vill lägga till ett mått, så kortet är lugnt som standard.
  const [adding, setAdding] = useState(false);
  const input = 'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm';

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Ruler className="size-4 text-muted" aria-hidden /> Mått
      </h2>
      {visible.length > 0 && (
        <ul className="mb-3 divide-y divide-line">
          {visible.map((m) => (
            <li key={m.id} className="group flex items-center justify-between py-1.5 text-sm">
              <span className="text-muted">{m.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">
                  {String(m.value).replace('.', ',')} {m.unit}
                </span>
                <button
                  type="button"
                  onClick={() => scheduleDelete('measurement', m.id, `Måttet ”${m.label}”`)}
                  className="text-muted opacity-50 group-hover:opacity-100 hover:text-danger pointer-coarse:p-3 pointer-coarse:opacity-100"
                  aria-label={`Ta bort ${m.label}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!adding ? (
        <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Lägg till mått
        </Button>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(value.replace(',', '.'));
            if (!label.trim() || !Number.isFinite(v) || !value.trim()) return;
            save.mutate(
              { roomId, label, value: v, unit },
              {
                onSuccess: () => {
                  setLabel('');
                  setValue('');
                  setAdding(false);
                },
              },
            );
          }}
        >
          <input
            aria-label="Vad mäts"
            placeholder="t.ex. Golvyta"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${input} min-w-28 flex-1`}
          />
          <input
            aria-label="Värde"
            placeholder="0"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${input} w-20`}
          />
          <select
            aria-label="Enhet"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={`${input} w-20`}
          >
            {['m²', 'm', 'cm', 'mm', 'm³', 'st', 'l'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary" className="h-9">
            Spara
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setAdding(false)}>
            Avbryt
          </Button>
        </form>
      )}
      {save.error && (
        <div className="mt-2">
          <ErrorBox error={save.error} />
        </div>
      )}
    </Card>
  );
}

export function RoomDetailPage() {
  const id = Number(useParams().id);
  const room = useRoom(id);
  const rooms = useRooms();
  const projects = useProjects({ roomId: id });
  const remove = useDeleteRoom();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const spent = rooms.data?.find((r) => r.id === id)?.spentOre ?? 0;

  if (room.error && 'status' in room.error && room.error.status === 404) return <NotFoundPage />;

  return (
    <QueryState query={room}>
      {(r) => (
        <>
          <Link
            to="/rum"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink pointer-coarse:py-3"
          >
            <ArrowLeft className="size-4" aria-hidden /> Alla rum
          </Link>
          <PageHeader
            title={r.name}
            subtitle={[
              r.floor,
              r.areaM2 && `${String(r.areaM2).replace('.', ',')} m²`,
              `${formatSek(spent)} totalt`,
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" aria-hidden /> Redigera
                </Button>
                <Button
                  variant="danger"
                  aria-label="Ta bort rum"
                  onClick={() =>
                    confirm(
                      `Ta bort rummet ”${r.name}”? Projekt och utgifter finns kvar men kopplas bort från rummet.`,
                    ) && remove.mutate(r.id, { onSuccess: () => navigate('/rum') })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            }
          />
          {r.description && (
            <p className="-mt-3 mb-6 max-w-prose text-sm whitespace-pre-wrap text-muted">
              {r.description}
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Projekt i rummet</h2>
                <Button size="sm" variant="secondary" onClick={() => setCreatingProject(true)}>
                  <Plus className="size-4" aria-hidden /> Nytt projekt
                </Button>
              </div>
              <QueryState query={projects}>
                {(list) =>
                  list.length === 0 ? (
                    <EmptyState title="Inga projekt i det här rummet ännu" />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {list.map((p) => (
                        <ProjectCard key={p.id} project={p} rooms={rooms.data ?? []} />
                      ))}
                    </div>
                  )
                }
              </QueryState>
            </section>
            <aside>
              <Measurements roomId={r.id} list={r.measurements} />
            </aside>
          </div>

          <div className="mt-8">
            <MaterialsPanel roomId={r.id} />
          </div>

          <section className="mt-8">
            <h2 className="mb-3 font-semibold">Bilder</h2>
            <PhotoGallery owner={{ roomId: r.id }} />
          </section>
          <section className="mt-8 max-w-2xl">
            <h2 className="mb-3 font-semibold">Anteckningar</h2>
            <NotesPanel owner={{ roomId: r.id }} />
          </section>

          <Modal open={editing} onClose={() => setEditing(false)} title="Redigera rum">
            <RoomForm room={r} onDone={() => setEditing(false)} />
          </Modal>
          <Modal
            open={creatingProject}
            onClose={() => setCreatingProject(false)}
            title="Nytt projekt"
          >
            <ProjectForm
              defaultRoomId={r.id}
              onDone={(saved) => {
                setCreatingProject(false);
                if (saved) navigate(`/projekt/${saved.id}`);
              }}
            />
          </Modal>
        </>
      )}
    </QueryState>
  );
}
