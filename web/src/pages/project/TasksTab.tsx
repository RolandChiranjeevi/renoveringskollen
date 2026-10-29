import { useState } from 'react';
import { ListChecks, Pencil, Trash2 } from 'lucide-react';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskListItem,
  type TaskPriority,
} from '@reno/shared';
import { useSaveTask, useTasks } from '../../api/hooks.ts';
import { Modal } from '../../components/Modal.tsx';
import {
  BudgetBar,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorBox,
  QueryState,
  SelectField,
  TextField,
} from '../../components/ui.tsx';
import { FormActions } from '../../forms/FormActions.tsx';
import { orNull, useSubmit } from '../../forms/useSubmit.ts';
import { addedByText, formatDate, formatSek, oreToInput, parseKronor } from '../../lib/format.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../../lib/undoDelete.tsx';

const priorityStyle: Record<TaskPriority, string> = {
  hog: 'text-danger',
  medel: 'text-warn',
  lag: 'text-muted',
};

function TaskForm({ task, onDone }: { task: TaskListItem; onDone: () => void }) {
  const save = useSaveTask();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [budget, setBudget] = useState(oreToInput(task.budgetOre));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const budgetOre = budget.trim() ? parseKronor(budget) : 0;
        if (budgetOre === undefined)
          return setErrors({ budgetOre: 'Ange ett belopp, t.ex. 15 000' });
        submit(
          () =>
            save.mutateAsync({
              id: task.id,
              projectId: task.projectId,
              title,
              priority,
              dueDate: orNull(dueDate),
              budgetOre,
            }),
          onDone,
        );
      }}
    >
      <TextField
        label="Uppgift"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        required
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Prioritet"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
        >
          {[...TASK_PRIORITIES].reverse().map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Senast"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={errors.dueDate}
        />
      </div>
      <TextField
        label="Budget (kr)"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        error={errors.budgetOre}
        inputMode="decimal"
        placeholder="0"
        hint="Koppla utgifter till uppgiften för att se utfallet."
      />
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}

function TaskRow({ task, onEdit }: { task: TaskListItem; onEdit: () => void }) {
  const save = useSaveTask();
  const scheduleDelete = useUndoableDelete();
  // Visa klickets resultat direkt medan servern sparar, annars känns bocken trög.
  // (Kontrollerade checkboxar återställs av React om state inte ändras i samma händelse.)
  const [pendingDone, setPendingDone] = useState<boolean>();
  const done = pendingDone ?? task.done;
  const hasMoney = task.budgetOre > 0 || task.spentOre > 0;
  const over = task.budgetOre > 0 && task.spentOre > task.budgetOre;
  return (
    <li className="group border-b border-line px-4 py-2.5 last:border-0">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            setPendingDone(e.target.checked);
            save.mutate(
              { id: task.id, projectId: task.projectId, done: e.target.checked },
              { onSettled: () => setPendingDone(undefined) },
            );
          }}
          aria-label={`Markera ”${task.title}” som ${done ? 'ej klar' : 'klar'}`}
          className="size-4 shrink-0 accent-brand-600 pointer-coarse:size-6"
        />
        <div className="min-w-0 flex-1">
          <p className={cx('text-sm', done && 'text-muted line-through')}>{task.title}</p>
          {(task.dueDate || task.completedAt || task.createdByName) && (
            <p className="text-xs text-muted">
              {[
                task.done && task.completedAt
                  ? `Klar ${formatDate(task.completedAt)}`
                  : task.dueDate && `Senast ${formatDate(task.dueDate)}`,
                addedByText(task.createdByName),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {!done && (
          <span className={cx('text-xs font-medium', priorityStyle[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
        )}
        <div className="flex opacity-60 group-hover:opacity-100">
          <Button variant="ghost" size="sm" aria-label={`Redigera ${task.title}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            aria-label={`Ta bort ${task.title}`}
            onClick={() => scheduleDelete('task', task.id, `Uppgiften ”${task.title}”`)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {hasMoney && (
        <div className="mt-1.5 ml-7 space-y-1">
          <p
            className={cx('text-xs tabular-nums', over ? 'font-medium text-danger' : 'text-muted')}
          >
            {formatSek(task.spentOre)}
            {task.budgetOre > 0 && ` av ${formatSek(task.budgetOre)}`}
            {over && ` · ${formatSek(task.spentOre - task.budgetOre)} över budget`}
          </p>
          <BudgetBar spent={task.spentOre} budget={task.budgetOre} />
        </div>
      )}
    </li>
  );
}

export function TasksTab({ projectId }: { projectId: number }) {
  const tasks = useTasks(projectId);
  const hidden = useHiddenIds('task');
  const save = useSaveTask();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medel');
  const [dueDate, setDueDate] = useState('');
  const [editing, setEditing] = useState<TaskListItem>();

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          save.mutate(
            { projectId, title, priority, dueDate: dueDate || null },
            {
              onSuccess: () => {
                setTitle('');
                setDueDate('');
              },
            },
          );
        }}
      >
        <label htmlFor="new-task" className="sr-only">
          Ny uppgift
        </label>
        <input
          id="new-task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ny uppgift, t.ex. Beställ klinker"
          className="h-10 min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
        <label htmlFor="new-task-priority" className="sr-only">
          Prioritet
        </label>
        <select
          id="new-task-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="h-10 rounded-lg border border-line bg-surface px-2 text-sm"
        >
          {[...TASK_PRIORITIES].reverse().map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <label htmlFor="new-task-due" className="sr-only">
          Senast
        </label>
        <input
          id="new-task-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-10 rounded-lg border border-line bg-surface px-2 text-sm"
        />
        <Button type="submit" loading={save.isPending} disabled={!title.trim()}>
          Lägg till
        </Button>
      </form>
      {save.error && <ErrorBox error={save.error} />}
      <QueryState query={withoutHidden(tasks, hidden)}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={<ListChecks className="size-6" />} title="Inga uppgifter ännu" />
          ) : (
            <Card>
              <ul>
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} onEdit={() => setEditing(t)} />
                ))}
              </ul>
            </Card>
          )
        }
      </QueryState>
      <Modal open={!!editing} onClose={() => setEditing(undefined)} title="Redigera uppgift">
        {editing && (
          <TaskForm key={editing.id} task={editing} onDone={() => setEditing(undefined)} />
        )}
      </Modal>
    </div>
  );
}
