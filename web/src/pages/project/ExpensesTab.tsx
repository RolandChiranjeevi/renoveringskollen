import { useState } from 'react';
import { ChevronDown, Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseListItem,
  type ProjectDetail,
  type RoomListItem,
} from '@reno/shared';
import {
  useAttachments,
  useContractors,
  useExpenses,
  useRooms,
  useTasks,
  useUploadAttachment,
} from '../../api/hooks.ts';
import { AttachmentTile } from '../../components/AttachmentGallery.tsx';
import { FileDropzone } from '../../components/FileDropzone.tsx';
import { Modal } from '../../components/Modal.tsx';
import { Button, Card, cx, EmptyState, ErrorBox, QueryState } from '../../components/ui.tsx';
import { ExpenseForm } from '../../forms/ExpenseForm.tsx';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../../lib/undoDelete.tsx';
import { addedByText, formatDate, formatSek } from '../../lib/format.ts';

function Receipts({ expenseId }: { expenseId: number }) {
  const receipts = useAttachments({ expenseId });
  const upload = useUploadAttachment();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('attachment');
  return (
    <div className="space-y-3">
      <QueryState query={withoutHidden(receipts, hidden)}>
        {(list) =>
          list.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {list.map((a) => (
                <AttachmentTile
                  key={a.id}
                  a={a}
                  onDelete={() => scheduleDelete('attachment', a.id, 'Kvittot')}
                />
              ))}
            </div>
          )
        }
      </QueryState>
      <FileDropzone
        inline
        onFiles={([file]) => file && upload.mutate({ file, kind: 'kvitto', expenseId })}
        label={upload.isPending ? 'Laddar upp…' : 'Lägg till kvitto'}
      />
      {upload.error && <ErrorBox error={upload.error} />}
    </div>
  );
}

function ExpenseRow({
  e,
  rooms,
  onEdit,
}: {
  e: ExpenseListItem;
  rooms: RoomListItem[];
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const scheduleDelete = useUndoableDelete();
  const room = rooms.find((r) => r.id === e.roomId);
  return (
    <li className="border-b border-line last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <ChevronDown
            className={cx('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.description}</p>
            <p className="truncate text-xs text-muted">
              {formatDate(e.date)} · {EXPENSE_CATEGORY_LABELS[e.category]}
              {e.store && ` · ${e.store}`}
              {room && ` · ${room.name}`}
              {addedByText(e.createdByName) && ` · ${addedByText(e.createdByName)}`}
            </p>
          </div>
          {e.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted" title="Kvitto bifogat">
              <Paperclip className="size-3.5" aria-label="Kvitto bifogat" />
              {e.attachmentCount > 1 && e.attachmentCount}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums">{formatSek(e.amountOre)}</span>
        </button>
      </div>
      {open && (
        <div className="space-y-3 bg-canvas/60 px-4 pt-1 pb-4">
          <Receipts expenseId={e.id} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden /> Redigera
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => scheduleDelete('expense', e.id, `Utgiften ”${e.description}”`)}
            >
              <Trash2 className="size-3.5" aria-hidden /> Ta bort
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ExpensesTab({ project }: { project: ProjectDetail }) {
  const expenses = useExpenses(project.id);
  const hidden = useHiddenIds('expense');
  const rooms = useRooms();
  const tasks = useTasks(project.id);
  const contractors = useContractors();
  const [editing, setEditing] = useState<ExpenseListItem | 'new'>();
  // Projektets rum först i rumsväljaren; finns inga kopplade rum visas alla.
  const allRooms = rooms.data ?? [];
  const projectRooms = allRooms.filter((r) => project.roomIds.includes(r.id));
  const roomChoices = projectRooms.length ? projectRooms : allRooms;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Ny utgift
        </Button>
      </div>
      <QueryState query={withoutHidden(expenses, hidden)}>
        {(list) => {
          if (list.length === 0)
            return (
              <EmptyState icon={<Receipt className="size-6" />} title="Inga utgifter ännu">
                Logga inköp och fakturor – och fota kvittot direkt.
              </EmptyState>
            );
          const byCategory = EXPENSE_CATEGORIES.map((c) => ({
            c,
            sum: list.filter((e) => e.category === c).reduce((s, e) => s + e.amountOre, 0),
          })).filter((x) => x.sum > 0);
          return (
            <>
              <div className="flex flex-wrap gap-2">
                {byCategory.map(({ c, sum }) => (
                  <span
                    key={c}
                    className="rounded-lg bg-surface px-3 py-1.5 text-xs ring-1 ring-line"
                  >
                    <span className="text-muted">{EXPENSE_CATEGORY_LABELS[c]}</span>{' '}
                    <span className="font-semibold tabular-nums">{formatSek(sum)}</span>
                  </span>
                ))}
              </div>
              <Card>
                <ul>
                  {list.map((e) => (
                    <ExpenseRow key={e.id} e={e} rooms={allRooms} onEdit={() => setEditing(e)} />
                  ))}
                </ul>
              </Card>
            </>
          );
        }}
      </QueryState>
      <Modal
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={editing === 'new' ? 'Ny utgift' : 'Redigera utgift'}
      >
        {editing && (
          <ExpenseForm
            key={editing === 'new' ? 'new' : editing.id}
            projectId={project.id}
            rooms={roomChoices}
            tasks={tasks.data ?? []}
            contractors={contractors.data ?? []}
            expense={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Modal>
    </div>
  );
}
