import { useState } from 'react';
import {
  PROJECT_KINDS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectDetail,
  type ProjectKind,
  type ProjectStatus,
} from '@reno/shared';
import { useContractors, useRooms, useSaveProject } from '../api/hooks.ts';
import { SelectField, TextAreaField, TextField } from '../components/ui.tsx';
import { oreToInput, parseKronor } from '../lib/format.ts';
import { FormActions } from './FormActions.tsx';
import { orNull, useSubmit } from './useSubmit.ts';

export function ProjectForm({
  project,
  defaultRoomId,
  onDone,
}: {
  project?: ProjectDetail;
  defaultRoomId?: number;
  onDone: (saved?: ProjectDetail) => void;
}) {
  const save = useSaveProject();
  const rooms = useRooms();
  const contractors = useContractors();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();

  const [title, setTitle] = useState(project?.title ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planerad');
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'forbattring');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [endDate, setEndDate] = useState(project?.endDate ?? '');
  const [budget, setBudget] = useState(oreToInput(project?.budgetOre));
  const [contractorId, setContractorId] = useState(
    project?.contractorId ? String(project.contractorId) : '',
  );
  const [warrantyUntil, setWarrantyUntil] = useState(project?.warrantyUntil ?? '');
  const [roomIds, setRoomIds] = useState<number[]>(
    project?.roomIds ?? (defaultRoomId ? [defaultRoomId] : []),
  );
  const [description, setDescription] = useState(project?.description ?? '');

  const toggleRoom = (id: number) =>
    setRoomIds((ids) => (ids.includes(id) ? ids.filter((r) => r !== id) : [...ids, id]));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const budgetOre = budget.trim() ? parseKronor(budget) : 0;
        if (budgetOre === undefined)
          return setErrors({ budgetOre: 'Ange ett belopp, t.ex. 25 000' });
        let saved: ProjectDetail | undefined;
        submit(
          async () => {
            saved = await save.mutateAsync({
              id: project?.id,
              title,
              status,
              kind,
              startDate: orNull(startDate),
              endDate: orNull(endDate),
              budgetOre,
              contractorId: contractorId ? Number(contractorId) : null,
              warrantyUntil: orNull(warrantyUntil),
              roomIds,
              description: orNull(description),
            });
          },
          () => onDone(saved),
        );
      }}
    >
      <TextField
        label="Namn på projektet"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        required
        autoFocus
        placeholder="t.ex. Nytt badrum"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Typ"
          value={kind}
          onChange={(e) => setKind(e.target.value as ProjectKind)}
          hint="Avgör hur kostnaden redovisas i försäljningsunderlaget"
        >
          {PROJECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROJECT_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Budget (kr)"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          error={errors.budgetOre}
          inputMode="decimal"
          placeholder="0"
        />
        <TextField
          label="Startdatum"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Slutdatum"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={errors.endDate}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rum</legend>
        {rooms.data?.length ? (
          <div className="flex flex-wrap gap-2">
            {rooms.data.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={roomIds.includes(r.id)}
                  onChange={() => toggleRoom(r.id)}
                />
                {r.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Inga rum ännu – lägg till rum under ”Rum”.</p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Hantverkare"
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
          error={errors.contractorId}
        >
          <option value="">Ingen / eget arbete</option>
          {contractors.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Garanti till"
          type="date"
          value={warrantyUntil}
          onChange={(e) => setWarrantyUntil(e.target.value)}
          error={errors.warrantyUntil}
        />
      </div>
      <TextAreaField
        label="Beskrivning"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        rows={4}
      />
      <FormActions
        onCancel={() => onDone()}
        submitting={submitting}
        formError={formError}
        submitLabel={project ? 'Spara' : 'Skapa projekt'}
      />
    </form>
  );
}
