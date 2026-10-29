import { useState } from 'react';
import type { Room } from '@reno/shared';
import { useSaveRoom } from '../api/hooks.ts';
import { TextAreaField, TextField } from '../components/ui.tsx';
import { FormActions } from './FormActions.tsx';
import { orNull, useSubmit } from './useSubmit.ts';

export function RoomForm({ room, onDone }: { room?: Room; onDone: (saved?: Room) => void }) {
  const save = useSaveRoom();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [name, setName] = useState(room?.name ?? '');
  const [floor, setFloor] = useState(room?.floor ?? '');
  const [area, setArea] = useState(
    room?.areaM2 != null ? String(room.areaM2).replace('.', ',') : '',
  );
  const [description, setDescription] = useState(room?.description ?? '');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const areaM2 = area.trim() ? Number(area.replace(',', '.')) : null;
        if (areaM2 !== null && !(areaM2 > 0))
          return setErrors({ areaM2: 'Ange en yta större än 0' });
        let saved: Room | undefined;
        submit(
          async () => {
            saved = await save.mutateAsync({
              id: room?.id,
              name,
              floor: orNull(floor),
              areaM2,
              description: orNull(description),
            });
          },
          () => onDone(saved),
        );
      }}
    >
      <TextField
        label="Namn"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        required
        autoFocus
        placeholder="t.ex. Kök"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Våning"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          error={errors.floor}
          placeholder="t.ex. Plan 1"
        />
        <TextField
          label="Yta (m²)"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          error={errors.areaM2}
          inputMode="decimal"
        />
      </div>
      <TextAreaField
        label="Beskrivning"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
      />
      <FormActions onCancel={() => onDone()} submitting={submitting} formError={formError} />
    </form>
  );
}
