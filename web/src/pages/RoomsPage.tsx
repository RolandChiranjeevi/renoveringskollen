import { useState } from 'react';
import { Link } from 'react-router';
import { DoorOpen, Plus } from 'lucide-react';
import { useRooms } from '../api/hooks.ts';
import { Modal } from '../components/Modal.tsx';
import { Button, Card, EmptyState, PageHeader, QueryState } from '../components/ui.tsx';
import { RoomForm } from '../forms/RoomForm.tsx';
import { formatSek } from '../lib/format.ts';

export function RoomsPage() {
  const rooms = useRooms();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Rum"
        subtitle="Husets rum och vad som lagts på vart och ett."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Nytt rum
          </Button>
        }
      />
      <QueryState query={rooms}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={<DoorOpen className="size-6" />} title="Inga rum ännu">
              Lägg till husets rum – kök, badrum, sovrum…
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => (
                <Link key={r.id} to={`/rum/${r.id}`} className="group">
                  <Card className="flex h-full items-center justify-between gap-3 p-4 transition-shadow group-hover:shadow-md">
                    <div className="min-w-0">
                      <p className="font-semibold group-hover:text-brand-700">{r.name}</p>
                      <p className="text-xs text-muted">
                        {[r.floor, r.areaM2 && `${String(r.areaM2).replace('.', ',')} m²`]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </p>
                    </div>
                    {r.spentOre > 0 && (
                      <span className="text-sm font-medium tabular-nums">
                        {formatSek(r.spentOre)}
                      </span>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )
        }
      </QueryState>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nytt rum">
        <RoomForm onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}
