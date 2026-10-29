import { useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Attachment,
  type Contractor,
  type Expense,
  type ExpenseCategory,
  type RoomListItem,
  type Task,
} from '@reno/shared';
import { attachmentUrl } from '../api/client.ts';
import { useSaveExpense, useUpdateAttachment, useUploadAttachment } from '../api/hooks.ts';
import { FileDropzone } from '../components/FileDropzone.tsx';
import { Button, SelectField, TextField } from '../components/ui.tsx';
import { oreToInput, parseKronor, todayIso } from '../lib/format.ts';
import { FormActions } from './FormActions.tsx';
import { orNull, useSubmit } from './useSubmit.ts';

interface Props {
  projectId: number;
  rooms: RoomListItem[];
  /** Projektets uppgifter – för budget mot utfall per uppgift. */
  tasks?: Task[];
  /** Sparade hantverkare – ger "Utfört av" och org.nr i underlagen. */
  contractors?: Contractor[];
  expense?: Expense;
  /** Ett redan uppladdat kvitto från inkorgen; kopplas till utgiften när den sparas. */
  inboxReceipt?: Attachment;
  onDone: () => void;
}

export function ExpenseForm({
  projectId,
  rooms,
  tasks = [],
  contractors = [],
  expense,
  inboxReceipt,
  onDone,
}: Props) {
  const save = useSaveExpense();
  const upload = useUploadAttachment();
  const link = useUpdateAttachment();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();

  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(oreToInput(expense?.amountOre));
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'material');
  const [store, setStore] = useState(expense?.store ?? '');
  const [roomId, setRoomId] = useState(
    expense?.roomId ? String(expense.roomId) : rooms.length === 1 ? String(rooms[0]!.id) : '',
  );
  const [taskId, setTaskId] = useState(expense?.taskId ? String(expense.taskId) : '');
  const [contractorId, setContractorId] = useState(
    expense?.contractorId ? String(expense.contractorId) : '',
  );
  const [receipt, setReceipt] = useState<File>();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const amountOre = parseKronor(amount);
        if (amountOre === undefined)
          return setErrors({ amountOre: 'Ange ett belopp, t.ex. 1 249,50' });
        submit(async () => {
          const saved = await save.mutateAsync({
            id: expense?.id,
            projectId,
            date,
            description,
            amountOre,
            category,
            store: orNull(store),
            roomId: roomId ? Number(roomId) : null,
            ...(tasks.length || expense?.taskId ? { taskId: taskId ? Number(taskId) : null } : {}),
            ...(contractors.length || expense?.contractorId
              ? { contractorId: contractorId ? Number(contractorId) : null }
              : {}),
          });
          if (inboxReceipt) await link.mutateAsync({ id: inboxReceipt.id, expenseId: saved.id });
          else if (receipt)
            await upload.mutateAsync({ file: receipt, kind: 'kvitto', expenseId: saved.id });
        }, onDone);
      }}
    >
      {inboxReceipt && inboxReceipt.mimeType.startsWith('image/') && (
        <img
          src={attachmentUrl(inboxReceipt.id)}
          alt="Kvittot"
          className="max-h-64 w-full rounded-lg border border-line bg-canvas object-contain"
        />
      )}
      <TextField
        label="Vad köptes?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        required
        autoFocus
        placeholder="t.ex. Kakel 30×60"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Belopp (kr)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amountOre}
          inputMode="decimal"
          required
          placeholder="0"
        />
        <TextField
          label="Datum"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          required
        />
        <SelectField
          label="Kategori"
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EXPENSE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Butik / firma"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          error={errors.store}
          placeholder="t.ex. Byggmax"
        />
      </div>
      {rooms.length > 0 && (
        <SelectField
          label="Rum"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          error={errors.roomId}
        >
          <option value="">Inget specifikt rum</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
      )}
      {(tasks.length > 0 || contractors.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {tasks.length > 0 && (
            <SelectField
              label="Uppgift"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              error={errors.taskId}
              hint="Räknas in i uppgiftens budget"
            >
              <option value="">Ingen uppgift</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </SelectField>
          )}
          {contractors.length > 0 && (
            <SelectField
              label="Hantverkare"
              value={contractorId}
              onChange={(e) => {
                setContractorId(e.target.value);
                // Fyll i firmanamnet om fältet är tomt, så syns det även i listor och export.
                const picked = contractors.find((c) => String(c.id) === e.target.value);
                if (picked && !store.trim()) setStore(picked.name);
              }}
              error={errors.contractorId}
            >
              <option value="">Ingen / eget arbete</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
      )}
      {!expense && !inboxReceipt && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Kvitto</p>
          {receipt ? (
            <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span className="truncate">{receipt.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setReceipt(undefined)}>
                Ta bort
              </Button>
            </div>
          ) : (
            <FileDropzone
              inline
              onFiles={([f]) => setReceipt(f)}
              label="Bifoga kvitto (valfritt)"
            />
          )}
        </div>
      )}
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}
