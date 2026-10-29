import { useState } from 'react';
import type { Contractor } from '@reno/shared';
import { useSaveContractor } from '../api/hooks.ts';
import { TextAreaField, TextField } from '../components/ui.tsx';
import { FormActions } from './FormActions.tsx';
import { orNull, useSubmit } from './useSubmit.ts';

export function ContractorForm({
  contractor,
  onDone,
}: {
  contractor?: Contractor;
  onDone: () => void;
}) {
  const save = useSaveContractor();
  const { errors, formError, submitting, submit } = useSubmit();
  const [f, setF] = useState({
    name: contractor?.name ?? '',
    orgNumber: contractor?.orgNumber ?? '',
    phone: contractor?.phone ?? '',
    email: contractor?.email ?? '',
    notes: contractor?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          () =>
            save.mutateAsync({
              id: contractor?.id,
              name: f.name,
              orgNumber: orNull(f.orgNumber),
              phone: orNull(f.phone),
              email: orNull(f.email),
              notes: orNull(f.notes),
            }),
          onDone,
        );
      }}
    >
      <TextField
        label="Namn"
        value={f.name}
        onChange={set('name')}
        error={errors.name}
        required
        autoFocus
        placeholder="t.ex. Snickare AB"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Organisationsnummer"
          value={f.orgNumber}
          onChange={set('orgNumber')}
          error={errors.orgNumber}
          placeholder="556677-8899"
        />
        <TextField
          label="Telefon"
          value={f.phone}
          onChange={set('phone')}
          error={errors.phone}
          type="tel"
        />
      </div>
      <TextField
        label="E-post"
        value={f.email}
        onChange={set('email')}
        error={errors.email}
        type="email"
      />
      <TextAreaField
        label="Anteckningar"
        value={f.notes}
        onChange={set('notes')}
        error={errors.notes}
      />
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}
