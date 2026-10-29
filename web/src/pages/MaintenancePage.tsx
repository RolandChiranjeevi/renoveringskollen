import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  History as HistoryIcon,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { MaintenanceItem, RoomListItem } from '@reno/shared';
import {
  useMaintenance,
  useMaintenanceHistory,
  useMarkMaintenanceDone,
  useRooms,
  useSaveMaintenance,
} from '../api/hooks.ts';
import { Modal } from '../components/Modal.tsx';
import { whenText } from '../components/UpcomingCard.tsx';
import {
  Button,
  Card,
  cx,
  EmptyState,
  PageHeader,
  QueryState,
  SelectField,
  TextAreaField,
  TextField,
} from '../components/ui.tsx';
import { FormActions } from '../forms/FormActions.tsx';
import { orNull, useSubmit } from '../forms/useSubmit.ts';
import { addMonthsIso, formatDate, intervalText, todayIso } from '../lib/format.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../lib/undoDelete.tsx';

const PRESETS = [1, 3, 6, 12, 24, 60];
const SECTIONS = [
  { status: 'overdue', title: 'Försenat' },
  { status: 'soon', title: 'Snart (inom 30 dagar)' },
  { status: 'later', title: 'Senare' },
  { status: 'unscheduled', title: 'Utan datum' },
] as const;

/** Huvudtext och datum för när nästa gång är. Långt fram visas bara datumet. */
function dueLabel(item: MaintenanceItem): { main: string; sub?: string } {
  if (item.dueOn === null || item.daysLeft === null) return { main: 'Ingen tid satt' };
  return item.daysLeft > 60
    ? { main: formatDate(item.dueOn) }
    : { main: whenText(item.daysLeft), sub: formatDate(item.dueOn) };
}

function MaintenanceForm({
  item,
  rooms,
  onDone,
}: {
  item?: MaintenanceItem;
  rooms: RoomListItem[];
  onDone: () => void;
}) {
  const save = useSaveMaintenance();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [title, setTitle] = useState(item?.title ?? '');
  const [roomId, setRoomId] = useState(item?.roomId ? String(item.roomId) : '');
  const isCustom = !!item && !PRESETS.includes(item.intervalMonths);
  const [preset, setPreset] = useState(isCustom ? 'annat' : String(item?.intervalMonths ?? 12));
  const [custom, setCustom] = useState(isCustom ? String(item!.intervalMonths) : '');
  const [lastDoneOn, setLastDoneOn] = useState('');
  const [firstDueOn, setFirstDueOn] = useState(item?.firstDueOn ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');

  const months = preset === 'annat' ? Number(custom) : Number(preset);
  const monthsValid = Number.isInteger(months) && months >= 1 && months <= 600;
  // Redigering ändrar inte historiken: "senast gjort" kommer från "Markera som gjord".
  const lastDone = item ? item.lastDoneOn : lastDoneOn || null;
  const askFirstDue = !lastDone;
  const next =
    lastDone && monthsValid
      ? addMonthsIso(lastDone, months)
      : askFirstDue
        ? firstDueOn || null
        : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!monthsValid) return setErrors({ intervalMonths: 'Ange hela månader, 1–600' });
        submit(
          () =>
            save.mutateAsync({
              id: item?.id,
              title,
              roomId: roomId ? Number(roomId) : null,
              intervalMonths: months,
              ...(item ? {} : { lastDoneOn: orNull(lastDoneOn) }),
              ...(askFirstDue ? { firstDueOn: orNull(firstDueOn) } : {}),
              notes: orNull(notes),
            }),
          onDone,
        );
      }}
    >
      <TextField
        label="Vad ska göras?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        required
        autoFocus
        placeholder="t.ex. Olja altanen, Rengör golvbrunn, Byt ventilationsfilter"
      />
      <SelectField
        label="Var?"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        error={errors.roomId}
      >
        <option value="">Hela huset</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Hur ofta?"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          error={preset === 'annat' ? undefined : errors.intervalMonths}
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {intervalText(p).replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
          <option value="annat">Annat antal månader…</option>
        </SelectField>
        {preset === 'annat' && (
          <TextField
            label="Antal månader"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            error={errors.intervalMonths}
            inputMode="numeric"
            placeholder="t.ex. 18"
            required
          />
        )}
      </div>
      {!item && (
        <TextField
          label="Senast gjort"
          type="date"
          max={todayIso()}
          value={lastDoneOn}
          onChange={(e) => setLastDoneOn(e.target.value)}
          error={errors.lastDoneOn}
          hint="Lämna tomt om det aldrig gjorts"
        />
      )}
      {askFirstDue && (
        <TextField
          label="Första gången ska det göras"
          type="date"
          value={firstDueOn}
          onChange={(e) => setFirstDueOn(e.target.value)}
          error={errors.firstDueOn}
          required={!item && !lastDoneOn}
        />
      )}
      <p className="text-sm" aria-live="polite">
        <span className="text-muted">Nästa gång: </span>
        <span className="font-medium">{next ? formatDate(next) : '–'}</span>
        {lastDone && (
          <span className="text-muted"> (räknas från senast gjort, {formatDate(lastDone)})</span>
        )}
      </p>
      <TextAreaField
        label="Anteckningar"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
        rows={2}
        placeholder="t.ex. produkt, hur det görs, vem som gör det"
      />
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}

function DoneForm({ item, onDone }: { item: MaintenanceItem; onDone: () => void }) {
  const mark = useMarkMaintenanceDone();
  const { errors, formError, submitting, submit } = useSubmit();
  const [doneOn, setDoneOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const next = doneOn ? addMonthsIso(doneOn, item.intervalMonths) : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => mark.mutateAsync({ id: item.id, doneOn, note: orNull(note) }), onDone);
      }}
    >
      <TextField
        label="När gjordes det?"
        type="date"
        max={todayIso()}
        value={doneOn}
        onChange={(e) => setDoneOn(e.target.value)}
        error={errors.doneOn}
        required
        autoFocus
      />
      <TextField
        label="Anteckning (valfritt)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={errors.note}
        placeholder="t.ex. Nytt filter F7, två strykningar olja"
      />
      <p className="text-sm" aria-live="polite">
        <span className="text-muted">Nästa gång blir: </span>
        <span className="font-medium">{next ? formatDate(next) : '–'}</span>
        <span className="text-muted"> ({intervalText(item.intervalMonths)})</span>
      </p>
      <FormActions
        onCancel={onDone}
        submitting={submitting}
        formError={formError}
        submitLabel="Markera som gjord"
      />
    </form>
  );
}

function HistoryList({ item }: { item: MaintenanceItem }) {
  const history = useMaintenanceHistory(item.id, true);
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('maintenanceLog');
  return (
    <QueryState query={withoutHidden(history, hidden)}>
      {(list) =>
        list.length === 0 ? (
          <p className="text-sm text-muted">Inte gjort än.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {list.map((h) => (
              <li key={h.id} className="group flex items-center justify-between gap-3 py-1.5">
                <span>
                  <span className="font-medium">{formatDate(h.doneOn)}</span>
                  {h.note && <span className="text-muted"> – {h.note}</span>}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Ta bort posten ${formatDate(h.doneOn)}`}
                  className="opacity-60 group-hover:opacity-100"
                  onClick={() =>
                    scheduleDelete('maintenanceLog', h.id, `Posten från ${formatDate(h.doneOn)}`)
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function MaintenanceCard({
  item,
  onEdit,
  onMarkDone,
}: {
  item: MaintenanceItem;
  onEdit: () => void;
  onMarkDone: () => void;
}) {
  const scheduleDelete = useUndoableDelete();
  const [showHistory, setShowHistory] = useState(false);
  const due = dueLabel(item);
  const overdue = item.status === 'overdue';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{item.title}</h3>
          <p className="text-sm text-muted">
            {item.roomName ?? 'Hela huset'} · {intervalText(item.intervalMonths)}
            {' · '}
            {item.lastDoneOn ? `senast ${formatDate(item.lastDoneOn)}` : 'aldrig gjort'}
          </p>
          {item.notes && <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p
            className={cx(
              'flex items-center justify-end gap-1 font-medium',
              overdue && 'text-danger',
            )}
          >
            {overdue && <AlertTriangle className="size-4" aria-hidden />}
            {due.main}
          </p>
          {due.sub && <p className="text-xs text-muted">{due.sub}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={overdue ? 'primary' : 'secondary'}
          onClick={onMarkDone}
          aria-label={`Markera ${item.title} som gjord`}
        >
          <Check className="size-4" aria-hidden /> Markera som gjord
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        >
          <HistoryIcon className="size-4" aria-hidden /> Historik
          {item.doneCount > 0 && ` (${item.doneCount})`}
          <ChevronDown
            className={cx('size-3.5 transition-transform', showHistory && 'rotate-180')}
            aria-hidden
          />
        </Button>
        <span className="ml-auto flex">
          <Button variant="ghost" size="sm" aria-label={`Redigera ${item.title}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            aria-label={`Ta bort ${item.title}`}
            onClick={() => scheduleDelete('maintenance', item.id, `Jobbet ”${item.title}”`)}
          >
            <Trash2 className="size-4" />
          </Button>
        </span>
      </div>
      {showHistory && (
        <div className="mt-3 border-t border-line pt-3">
          <HistoryList item={item} />
        </div>
      )}
    </Card>
  );
}

export function MaintenancePage() {
  const list = useMaintenance();
  const hidden = useHiddenIds('maintenance');
  const rooms = useRooms();
  const [editing, setEditing] = useState<MaintenanceItem | 'new'>();
  const [marking, setMarking] = useState<MaintenanceItem>();

  return (
    <>
      <PageHeader
        title="Underhåll"
        subtitle="Återkommande jobb i huset – nästa gång räknas från när du senast gjorde det."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nytt jobb
          </Button>
        }
      />
      <QueryState query={withoutHidden(list, hidden)}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon={<Wrench className="size-6" />} title="Inga underhållsjobb ännu">
              Lägg till sådant som ska göras om och om igen: olja altanen, rengör golvbrunnen, byt
              ventilationsfilter, sota.
            </EmptyState>
          ) : (
            <div className="space-y-8">
              {SECTIONS.map(({ status, title }) => {
                const group = items.filter((i) => i.status === status);
                if (group.length === 0) return null;
                return (
                  <section key={status} aria-labelledby={`maintenance-${status}`}>
                    <h2
                      id={`maintenance-${status}`}
                      className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"
                    >
                      {title} <span className="font-normal">({group.length})</span>
                    </h2>
                    <div className="space-y-3">
                      {group.map((item) => (
                        <MaintenanceCard
                          key={item.id}
                          item={item}
                          onEdit={() => setEditing(item)}
                          onMarkDone={() => setMarking(item)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )
        }
      </QueryState>

      <Modal
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={editing === 'new' ? 'Nytt underhållsjobb' : 'Redigera jobb'}
      >
        {editing && (
          <MaintenanceForm
            key={editing === 'new' ? 'new' : editing.id}
            item={editing === 'new' ? undefined : editing}
            rooms={rooms.data ?? []}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Modal>
      <Modal
        open={!!marking}
        onClose={() => setMarking(undefined)}
        title={marking ? `Markera som gjord: ${marking.title}` : ''}
      >
        {marking && (
          <DoneForm key={marking.id} item={marking} onDone={() => setMarking(undefined)} />
        )}
      </Modal>
    </>
  );
}
