import { useState, type MouseEvent } from 'react';
import { FileText, ImageIcon, Trash2 } from 'lucide-react';
import {
  ATTACHMENT_KIND_LABELS,
  isPreviewable,
  pairBeforeAfter,
  type Attachment,
  type AttachmentKind,
} from '@reno/shared';
import { attachmentUrl } from '../api/client.ts';
import { useAttachments, useUploadAttachment } from '../api/hooks.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../lib/undoDelete.tsx';

import { formatBytes, formatDate } from '../lib/format.ts';
import { FileDropzone } from './FileDropzone.tsx';
import { PhotoViewer } from './PhotoViewer.tsx';
import { Button, cx, EmptyState, ErrorBox, QueryState } from './ui.tsx';

// HEIC kan bara visas i Safari; övriga webbläsare får en filruta med länk.
const previewable = (a: Attachment) => isPreviewable(a.mimeType);

export function AttachmentTile({
  a,
  onDelete,
  onOpen,
}: {
  a: Attachment;
  onDelete?: () => void;
  /** Öppnar bildvisaren i stället för att öppna filen i en ny flik. */
  onOpen?: () => void;
}) {
  const link = onOpen
    ? {
        href: attachmentUrl(a.id),
        onClick: (e: MouseEvent<HTMLAnchorElement>) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          onOpen();
        },
      }
    : { href: attachmentUrl(a.id), target: '_blank', rel: 'noreferrer' };
  return (
    <figure className="group relative overflow-hidden rounded-xl border border-line bg-surface">
      <a
        {...link}
        aria-label={`Öppna ${a.caption ?? a.originalName}`}
        className="block aspect-[4/3] bg-canvas"
      >
        {previewable(a) ? (
          <img
            src={attachmentUrl(a.id)}
            alt={a.originalName}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted">
            {a.mimeType === 'application/pdf' ? (
              <FileText className="size-8" />
            ) : (
              <ImageIcon className="size-8" />
            )}
            <span className="text-xs uppercase">{a.mimeType.split('/')[1]}</span>
          </div>
        )}
      </a>
      <figcaption className="flex items-center gap-2 px-2.5 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{a.caption ?? a.originalName}</p>
          <p className="text-muted">
            {formatDate(a.createdAt)} · {formatBytes(a.sizeBytes)}
          </p>
        </div>
        {onDelete && (
          <Button
            variant="danger"
            size="sm"
            aria-label={`Ta bort ${a.originalName}`}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

const PHOTO_KINDS: AttachmentKind[] = ['fore', 'efter', 'ovrigt'];

/** Före och efter sida vid sida. Klick öppnar bildvisaren. */
function BeforeAfter({ photos, onOpen }: { photos: Attachment[]; onOpen: (id: number) => void }) {
  const pairs = pairBeforeAfter(photos);
  if (pairs.length === 0) return null;
  return (
    <section aria-labelledby="before-after">
      <h3 id="before-after" className="mb-2 text-sm font-semibold text-muted">
        Före och efter
      </h3>
      <div className="space-y-4">
        {pairs.map(({ before, after }) => (
          <div key={before.id} className="grid grid-cols-2 gap-3">
            {[
              { a: before, label: 'Före' },
              { a: after, label: 'Efter' },
            ].map(({ a, label }) => (
              <figure key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  aria-label={`${label}: ${a.caption ?? a.originalName}`}
                  className="block aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-canvas"
                >
                  <img
                    src={attachmentUrl(a.id)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
                <figcaption className="mt-1 text-xs">
                  <span className="font-semibold">{label}</span>
                  <span className="text-muted">
                    {' '}
                    · {formatDate(a.createdAt)}
                    {a.caption && ` · ${a.caption}`}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bilder grupperade som Före / Efter / Övrigt, med uppladdning. */
export function PhotoGallery({ owner }: { owner: { projectId?: number; roomId?: number } }) {
  const query = useAttachments(owner);
  const upload = useUploadAttachment();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('attachment');
  const [kind, setKind] = useState<AttachmentKind>('fore');
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [openId, setOpenId] = useState<number>();

  const uploadAll = async (files: File[]) => {
    setProgress({ done: 0, total: files.length });
    try {
      for (const [i, file] of files.entries()) {
        await upload.mutateAsync({ ...owner, file, kind });
        setProgress({ done: i + 1, total: files.length });
      }
    } finally {
      setProgress(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div
            className="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Typ av bild"
          >
            <span className="text-sm text-muted">Ladda upp som:</span>
            {PHOTO_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cx(
                  'rounded-full border px-3 py-1 text-sm pointer-coarse:py-2.5',
                  kind === k
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {ATTACHMENT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <FileDropzone
            inline
            multiple
            onFiles={uploadAll}
            label={
              progress
                ? `Laddar upp ${progress.done + 1} av ${progress.total}…`
                : 'Lägg till bilder'
            }
          />
        </div>
        {upload.error && <ErrorBox error={upload.error} />}
      </div>

      <QueryState query={withoutHidden(query, hidden)}>
        {(list) => {
          const photos = list.filter((a) => a.kind !== 'kvitto');
          if (photos.length === 0)
            return (
              <EmptyState icon={<ImageIcon className="size-6" />} title="Inga bilder ännu">
                Ta före-bilder innan du river – de är guld värda senare.
              </EmptyState>
            );
          const groups = PHOTO_KINDS.map((k) => ({
            kind: k,
            items: photos.filter((a) => a.kind === k),
          }));
          // Bläddra i samma ordning som bilderna visas; filer som inte går att visa (HEIC, PDF) hoppas över.
          const viewable = groups.flatMap((g) => g.items).filter(previewable);
          const open = (a: Attachment) => (previewable(a) ? () => setOpenId(a.id) : undefined);
          return (
            <>
              <BeforeAfter photos={photos} onOpen={setOpenId} />
              {groups.map(({ kind: k, items }) =>
                items.length === 0 ? null : (
                  <section key={k}>
                    <h3 className="mb-2 text-sm font-semibold text-muted">
                      {ATTACHMENT_KIND_LABELS[k]}{' '}
                      <span className="font-normal">({items.length})</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((a) => (
                        <AttachmentTile
                          key={a.id}
                          a={a}
                          onOpen={open(a)}
                          onDelete={() =>
                            scheduleDelete(
                              'attachment',
                              a.id,
                              `Bilden ”${a.caption ?? a.originalName}”`,
                            )
                          }
                        />
                      ))}
                    </div>
                  </section>
                ),
              )}
              <PhotoViewer photos={viewable} openId={openId} onOpenId={setOpenId} editable />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
