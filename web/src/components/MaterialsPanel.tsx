import { useState } from 'react';
import { Link } from 'react-router';
import { Layers, Paintbrush, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  MATERIAL_SURFACES,
  MATERIAL_SURFACE_LABELS,
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABELS,
  type Material,
  type MaterialSurface,
  type MaterialType,
} from '@reno/shared';
import { useExpenseSearch, useMaterials, useProjects, useSaveMaterial } from '../api/hooks.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../lib/undoDelete.tsx';
import { FormActions } from '../forms/FormActions.tsx';
import { orNull, useSubmit } from '../forms/useSubmit.ts';
import { formatDate, formatSek } from '../lib/format.ts';
import { ncsToHex, swatchFor } from '../lib/ncs.ts';
import { Modal } from './Modal.tsx';
import {
  Button,
  Card,
  EmptyState,
  QueryState,
  SelectField,
  TextAreaField,
  TextField,
} from './ui.tsx';

/**
 * Liten färgruta. En angiven färg (hex) visas som den är. Saknas den räknas en ungefärlig färg ut ur
 * en NCS-kod – NCS kan inte återges exakt på skärm, så den rutan märks som ungefärlig.
 */
export function ColorSwatch({
  hex,
  code,
  label,
}: {
  hex: string | null;
  code?: string | null;
  label?: string;
}) {
  const swatch = swatchFor(hex, code);
  if (!swatch) return null;
  const name = label ? ` ${label}` : '';
  return (
    <span
      className="inline-block size-5 shrink-0 rounded-md ring-1 ring-ink/20 ring-inset"
      style={{ backgroundColor: swatch.hex }}
      role="img"
      aria-label={swatch.approximate ? `Ungefärligt färgprov${name}` : `Färgprov${name}`}
      title={
        swatch.approximate
          ? 'Ungefärlig färg beräknad från NCS-koden – kan avvika från den riktiga kulören'
          : undefined
      }
    />
  );
}

/** "Alcro · NCS S 0502-Y · Helmatt 7" */
export const materialDetails = (m: Material) =>
  [m.brand, m.colorCode, m.finish, m.quantity].filter(Boolean).join(' · ');

function MaterialForm({
  roomId,
  material,
  onDone,
}: {
  roomId: number;
  material?: Material;
  onDone: () => void;
}) {
  const save = useSaveMaterial();
  const projects = useProjects({ roomId });
  const expenses = useExpenseSearch({ roomId });
  const { errors, formError, submitting, submit } = useSubmit();
  const [f, setF] = useState({
    type: (material?.type ?? 'farg') as MaterialType,
    surface: (material?.surface ?? 'vagg') as MaterialSurface,
    name: material?.name ?? '',
    brand: material?.brand ?? '',
    colorCode: material?.colorCode ?? '',
    colorHex: material?.colorHex ?? '',
    finish: material?.finish ?? '',
    quantity: material?.quantity ?? '',
    appliedOn: material?.appliedOn ?? '',
    projectId: material?.projectId ? String(material.projectId) : '',
    expenseId: material?.expenseId ? String(material.expenseId) : '',
    notes: material?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const isPaint = f.type === 'farg';
  const validHex = /^#[0-9a-fA-F]{6}$/.test(f.colorHex);
  // Ingen färgruta angiven men en NCS-kod som går att räkna ut: erbjud den som färgruta.
  const ncsHex = !validHex ? ncsToHex(f.colorCode) : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          () =>
            save.mutateAsync({
              id: material?.id,
              roomId,
              type: f.type,
              surface: f.surface,
              name: f.name,
              brand: orNull(f.brand),
              colorCode: isPaint ? orNull(f.colorCode) : null,
              colorHex: isPaint ? orNull(f.colorHex) : null,
              finish: orNull(f.finish),
              quantity: orNull(f.quantity),
              appliedOn: orNull(f.appliedOn),
              projectId: f.projectId ? Number(f.projectId) : null,
              expenseId: f.expenseId ? Number(f.expenseId) : null,
              notes: orNull(f.notes),
            }),
          onDone,
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Typ" value={f.type} onChange={set('type')}>
          {MATERIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {MATERIAL_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Yta" value={f.surface} onChange={set('surface')}>
          {MATERIAL_SURFACES.map((s) => (
            <option key={s} value={s}>
              {MATERIAL_SURFACE_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={isPaint ? 'Vad för färg?' : 'Material'}
        value={f.name}
        onChange={set('name')}
        error={errors.name}
        required
        autoFocus
        placeholder={
          isPaint
            ? 't.ex. Väggfärg, Takfärg, Snickerifärg'
            : 't.ex. Ekparkett 14 mm, Gips + plywood'
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Märke / tillverkare"
          value={f.brand}
          onChange={set('brand')}
          error={errors.brand}
          placeholder={isPaint ? 't.ex. Alcro, Beckers' : 't.ex. Kährs, Gyproc'}
        />
        <TextField
          label={isPaint ? 'Glans' : 'Ytbehandling / typ'}
          value={f.finish}
          onChange={set('finish')}
          error={errors.finish}
          placeholder={isPaint ? 't.ex. Helmatt 7' : 't.ex. Mattlack, 13 mm'}
        />
      </div>
      {isPaint && (
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <TextField
            label="Kulörkod"
            value={f.colorCode}
            onChange={set('colorCode')}
            error={errors.colorCode}
            placeholder="t.ex. NCS S 0502-Y"
          />
          <TextField
            label="Färgruta (hex)"
            value={f.colorHex}
            onChange={set('colorHex')}
            error={errors.colorHex}
            placeholder="#F2EFE8"
            hint={validHex ? undefined : 'Valfritt'}
          />
        </div>
      )}
      {isPaint && validHex && (
        <p className="-mt-2 flex items-center gap-2 text-xs text-muted">
          <ColorSwatch hex={f.colorHex} /> Ungefärlig färg på skärm – kulörkoden gäller.
        </p>
      )}
      {isPaint && ncsHex && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-2">
            <ColorSwatch hex={null} code={f.colorCode} /> Ungefärlig färg från NCS-koden ({ncsHex})
            – kulörkoden gäller.
          </span>
          <button
            type="button"
            onClick={() => setF((prev) => ({ ...prev, colorHex: ncsHex }))}
            className="rounded-md py-1 font-medium text-brand-700 hover:underline pointer-coarse:py-3"
          >
            Använd som färgruta
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Mängd"
          value={f.quantity}
          onChange={set('quantity')}
          error={errors.quantity}
          placeholder={isPaint ? 't.ex. 2 × 3 l' : 't.ex. 22 m²'}
        />
        <TextField
          label="Datum"
          type="date"
          value={f.appliedOn}
          onChange={set('appliedOn')}
          error={errors.appliedOn}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Projekt"
          value={f.projectId}
          onChange={set('projectId')}
          error={errors.projectId}
        >
          <option value="">Inget projekt</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Utgift / kvitto"
          value={f.expenseId}
          onChange={set('expenseId')}
          error={errors.expenseId}
        >
          <option value="">Ingen koppling</option>
          {expenses.data?.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.description} – {formatSek(e.amountOre)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        label="Anteckningar"
        value={f.notes}
        onChange={set('notes')}
        error={errors.notes}
        rows={2}
      />
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}

/** "Material och färg" för ett rum, grupperat per yta. */
export function MaterialsPanel({ roomId }: { roomId: number }) {
  const materials = useMaterials(roomId);
  const expenses = useExpenseSearch({ roomId });
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('material');
  const [editing, setEditing] = useState<Material | 'new'>();
  const expenseById = new Map(expenses.data?.items.map((e) => [e.id, e]));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Material och färg</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Lägg till material
        </Button>
      </div>
      <QueryState query={withoutHidden(materials, hidden)}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={<Paintbrush className="size-6" />} title="Inget registrerat ännu">
              Skriv upp färger, kulörkoder och material – bra att ha när något ska bättras eller
              säljas.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-line">
              {MATERIAL_SURFACES.map((surface) => {
                const group = list.filter((m) => m.surface === surface);
                if (group.length === 0) return null;
                return (
                  <div key={surface} className="px-4 py-3">
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                      {MATERIAL_SURFACE_LABELS[surface]}
                    </h3>
                    <ul className="space-y-2">
                      {group.map((m) => {
                        const expense = m.expenseId ? expenseById.get(m.expenseId) : undefined;
                        return (
                          <li key={m.id} className="group flex items-start gap-3">
                            <span className="mt-0.5">
                              {swatchFor(m.colorHex, m.colorCode) ? (
                                <ColorSwatch
                                  hex={m.colorHex}
                                  code={m.colorCode}
                                  label={m.colorCode ?? m.name}
                                />
                              ) : m.type === 'farg' ? (
                                <Paintbrush className="size-5 text-muted" aria-hidden />
                              ) : (
                                <Layers className="size-5 text-muted" aria-hidden />
                              )}
                            </span>
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="font-medium">{m.name}</p>
                              {materialDetails(m) && (
                                <p className="text-muted">{materialDetails(m)}</p>
                              )}
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                                {m.appliedOn && <span>{formatDate(m.appliedOn)}</span>}
                                {expense && (
                                  <Link
                                    to={`/projekt/${expense.projectId}?flik=utgifter`}
                                    className="inline-flex items-center gap-0.5 text-brand-700 hover:underline"
                                  >
                                    <Paperclip className="size-3" aria-hidden />
                                    {expense.description}
                                  </Link>
                                )}
                                {m.notes && <span className="whitespace-pre-wrap">{m.notes}</span>}
                              </p>
                            </div>
                            <div className="flex opacity-60 group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Redigera ${m.name}`}
                                onClick={() => setEditing(m)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                aria-label={`Ta bort ${m.name}`}
                                onClick={() =>
                                  scheduleDelete('material', m.id, `Materialet ”${m.name}”`)
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </Card>
          )
        }
      </QueryState>
      <Modal
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={editing === 'new' ? 'Lägg till material eller färg' : 'Redigera'}
      >
        {editing && (
          <MaterialForm
            key={editing === 'new' ? 'new' : editing.id}
            roomId={roomId}
            material={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Modal>
    </section>
  );
}
