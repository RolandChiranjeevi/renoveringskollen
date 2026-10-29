import { useRef, useState } from 'react';
import { Camera, FileText, Receipt, Trash2, Upload } from 'lucide-react';
import type { Attachment } from '@reno/shared';
import { attachmentUrl } from '../api/client.ts';
import {
  useContractors,
  useProjects,
  useReceiptInbox,
  useRooms,
  useTasks,
  useUploadAttachment,
} from '../api/hooks.ts';
import { ExpenseForm } from '../forms/ExpenseForm.tsx';
import { formatDate } from '../lib/format.ts';
import { useHiddenIds, useUndoableDelete } from '../lib/undoDelete.tsx';

import { Modal } from './Modal.tsx';
import { Button, Card, ErrorBox, SelectField } from './ui.tsx';

const MAX_BYTES = 10 * 1024 * 1024;

/** Steg 2: välj projekt, fyll i uppgifterna medan kvittot syns, och koppla kvittot till utgiften. */
function ExpenseFromReceipt({ receipt, onDone }: { receipt: Attachment; onDone: () => void }) {
  const projects = useProjects();
  const rooms = useRooms();
  const contractors = useContractors();
  const [projectId, setProjectId] = useState('');
  const tasks = useTasks(Number(projectId) || 0);
  const list = projects.data ?? [];
  const project = list.find((p) => String(p.id) === projectId);
  const allRooms = rooms.data ?? [];
  const projectRooms = project ? allRooms.filter((r) => project.roomIds.includes(r.id)) : [];

  return (
    <div className="space-y-4">
      <SelectField
        label="Vilket projekt?"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        <option value="">Välj projekt…</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </SelectField>
      {project ? (
        <ExpenseForm
          key={project.id}
          projectId={project.id}
          rooms={projectRooms.length ? projectRooms : allRooms}
          tasks={(tasks.data ?? []).filter((t) => !t.done)}
          contractors={contractors.data ?? []}
          inboxReceipt={receipt}
          onDone={onDone}
        />
      ) : (
        <>
          {receipt.mimeType.startsWith('image/') && (
            <img
              src={attachmentUrl(receipt.id)}
              alt="Kvittot"
              className="max-h-64 w-full rounded-lg border border-line bg-canvas object-contain"
            />
          )}
          {list.length === 0 && !projects.isPending && (
            <p className="text-sm text-muted">
              Skapa ett projekt först, sedan kan kvittot kopplas dit.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Kvittoinkorgen: fota kvittot direkt i butiken och fyll i uppgifterna senare.
 * Kvittona räknas inte som utgifter förrän de kopplats till en.
 */
export function ReceiptInbox() {
  const inbox = useReceiptInbox();
  const upload = useUploadAttachment();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('attachment');
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState<Attachment>();
  const [sizeError, setSizeError] = useState<string>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();

  const uploadAll = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const tooBig = files.filter((f) => f.size > MAX_BYTES);
    setSizeError(
      tooBig.length
        ? `För stor fil (max 10 MB): ${tooBig.map((f) => f.name).join(', ')}`
        : undefined,
    );
    const ok = files.filter((f) => f.size <= MAX_BYTES);
    setProgress({ done: 0, total: ok.length });
    try {
      for (const [i, file] of ok.entries()) {
        await upload.mutateAsync({ file, kind: 'kvitto' });
        setProgress({ done: i + 1, total: ok.length });
      }
    } finally {
      setProgress(undefined);
    }
  };

  const receipts = (inbox.data ?? []).filter((r) => !hidden.has(r.id));

  return (
    <Card className="mb-4 space-y-3 p-4">
      <section aria-labelledby="receipt-inbox-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="receipt-inbox-title" className="flex items-center gap-2 font-semibold">
              <Receipt className="size-4 text-muted" aria-hidden />
              Kvitton att bokföra
              {receipts.length > 0 && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {receipts.length}
                </span>
              )}
            </h2>
            <p className="hidden text-sm text-muted sm:block">
              Fota kvittot direkt, fyll i uppgifterna när du har tid. Inget räknas som utgift förrän
              du gjort det.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => camera.current?.click()} disabled={upload.isPending}>
              <Camera className="size-4" aria-hidden /> Fota kvitto
            </Button>
            <Button
              variant="secondary"
              onClick={() => picker.current?.click()}
              disabled={upload.isPending}
            >
              <Upload className="size-4" aria-hidden /> Välj fil
            </Button>
          </div>
          {/* Kameran öppnas direkt på mobilen; på datorn blir det en vanlig filväljare. */}
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Kamera för kvitto"
            tabIndex={-1}
            onChange={(e) => {
              void uploadAll(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf"
            multiple
            className="sr-only"
            aria-label="Välj kvittofiler"
            tabIndex={-1}
            onChange={(e) => {
              void uploadAll(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {progress && (
          <p className="text-sm text-muted" role="status">
            Laddar upp {Math.min(progress.done + 1, progress.total)} av {progress.total}…
          </p>
        )}
        {sizeError && <p className="text-sm text-danger">{sizeError}</p>}
        {upload.error && <ErrorBox error={upload.error} />}
        {inbox.error && <ErrorBox error={inbox.error} />}

        {receipts.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-xl border border-line bg-surface"
                aria-label={`Kvitto ${r.originalName}`}
              >
                <a
                  href={attachmentUrl(r.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Öppna ${r.originalName}`}
                  className="block aspect-[4/3] bg-canvas"
                >
                  {r.mimeType.startsWith('image/') && r.mimeType !== 'image/heic' ? (
                    <img
                      src={attachmentUrl(r.id)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted">
                      <FileText className="size-8" aria-hidden />
                    </span>
                  )}
                </a>
                <div className="space-y-2 p-2.5">
                  <p className="text-xs text-muted">{formatDate(r.createdAt)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setConverting(r)}>
                      Skapa utgift
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Ta bort kvitto ${r.originalName}`}
                      onClick={() => scheduleDelete('attachment', r.id, 'Kvittot')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={!!converting}
        onClose={() => setConverting(undefined)}
        title="Skapa utgift från kvitto"
      >
        {converting && (
          <ExpenseFromReceipt
            key={converting.id}
            receipt={converting}
            onDone={() => setConverting(undefined)}
          />
        )}
      </Modal>
    </Card>
  );
}
