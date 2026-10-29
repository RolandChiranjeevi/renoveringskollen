import { useState } from 'react';
import { HardHat, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import type { Contractor } from '@reno/shared';
import { useContractors } from '../api/hooks.ts';
import { Modal } from '../components/Modal.tsx';
import { Button, Card, EmptyState, PageHeader, QueryState } from '../components/ui.tsx';
import { ContractorForm } from '../forms/ContractorForm.tsx';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../lib/undoDelete.tsx';

export function ContractorsPage() {
  const contractors = useContractors();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('contractor');
  const [editing, setEditing] = useState<Contractor | 'new'>();

  return (
    <>
      <PageHeader
        title="Hantverkare"
        subtitle="Firmor du anlitat – bra att ha vid garantiärenden och ROT."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Ny hantverkare
          </Button>
        }
      />
      <QueryState query={withoutHidden(contractors, hidden)}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={<HardHat className="size-6" />} title="Inga hantverkare ännu" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name}</p>
                      {c.orgNumber && <p className="text-xs text-muted">Org.nr {c.orgNumber}</p>}
                    </div>
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Redigera ${c.name}`}
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        aria-label={`Ta bort ${c.name}`}
                        onClick={() => scheduleDelete('contractor', c.id, `Hantverkaren ${c.name}`)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-1.5 text-brand-700 hover:underline"
                      >
                        <Phone className="size-3.5" aria-hidden /> {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1.5 text-brand-700 hover:underline"
                      >
                        <Mail className="size-3.5" aria-hidden /> {c.email}
                      </a>
                    )}
                    {c.notes && <p className="pt-1 whitespace-pre-wrap text-muted">{c.notes}</p>}
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>
      <Modal
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={editing === 'new' ? 'Ny hantverkare' : 'Redigera hantverkare'}
      >
        {editing && (
          <ContractorForm
            key={editing === 'new' ? 'new' : editing.id}
            contractor={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Modal>
    </>
  );
}
