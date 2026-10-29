import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { ATTACHMENT_KIND_LABELS, type Attachment, type AttachmentKind } from '@reno/shared';
import { attachmentUrl } from '../api/client.ts';
import { useUpdateAttachment } from '../api/hooks.ts';
import { formatDate } from '../lib/format.ts';
import { Button } from './ui.tsx';

const SWIPE_PX = 50;
const KINDS: AttachmentKind[] = ['fore', 'efter', 'ovrigt'];

interface PhotoViewerProps {
  /** Bilderna som går att bläddra mellan, i visningsordning. */
  photos: Attachment[];
  /** Id på bilden som visas just nu; tomt = stängd. */
  openId: number | undefined;
  onOpenId: (id: number | undefined) => void;
  /** Visar fält för bildtext och typ. */
  editable?: boolean;
}

function CaptionForm({ photo }: { photo: Attachment }) {
  const update = useUpdateAttachment();
  const [caption, setCaption] = useState(photo.caption ?? '');
  const changed = caption.trim() !== (photo.caption ?? '');

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) update.mutate({ id: photo.id, caption: caption.trim() || null });
      }}
    >
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={300}
        placeholder="Bildtext, t.ex. Väggen mot trädgården"
        aria-label="Bildtext"
        className="min-w-0 flex-1 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50"
      />
      <Button type="submit" size="sm" disabled={!changed || update.isPending}>
        Spara text
      </Button>
      <select
        value={photo.kind}
        aria-label="Typ av bild"
        onChange={(e) => update.mutate({ id: photo.id, kind: e.target.value as AttachmentKind })}
        className="rounded-lg border border-white/25 bg-white/10 px-2 py-1.5 text-sm text-white"
      >
        {KINDS.map((k) => (
          <option key={k} value={k} className="text-ink">
            {ATTACHMENT_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {update.isError && <span className="text-sm text-red-300">Det gick inte att spara.</span>}
    </form>
  );
}

/**
 * Helskärmsvisare för bilder: pilknappar, piltangenter och svep, med bildtext.
 * Bygger på <dialog> så att Esc, fokusfälla och tillgänglighet kommer från webbläsaren.
 */
export function PhotoViewer({ photos, openId, onOpenId, editable = false }: PhotoViewerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const swipeStart = useRef<number | null>(null);
  const index = photos.findIndex((p) => p.id === openId);
  const photo = index >= 0 ? photos[index] : undefined;
  const open = !!photo;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const go = (step: number) => {
    if (photos.length < 2 || index < 0) return;
    onOpenId(photos[(index + step + photos.length) % photos.length]!.id);
  };

  const onPointerDown = (e: PointerEvent) => {
    swipeStart.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenId(undefined)}
      onKeyDown={(e) => {
        // Pilarna får inte styra bildtextens textfält.
        if ((e.target as HTMLElement).closest('input, select')) return;
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
      aria-label="Bildvisare"
      className="m-0 size-full max-h-none max-w-none bg-transparent p-0 text-white backdrop:bg-black/90"
    >
      {photo && (
        <div className="flex size-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span aria-live="polite">
              {index + 1} av {photos.length} · {ATTACHMENT_KIND_LABELS[photo.kind]} ·{' '}
              {formatDate(photo.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <a
                href={attachmentUrl(photo.id, true)}
                aria-label="Ladda ner bilden"
                className="rounded-md p-2 hover:bg-white/15"
              >
                <Download className="size-5" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                aria-label="Stäng"
                className="rounded-md p-2 hover:bg-white/15"
              >
                <X className="size-5" aria-hidden />
              </button>
            </span>
          </div>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center select-none"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
          >
            <img
              key={photo.id}
              src={attachmentUrl(photo.id)}
              alt={photo.caption ?? photo.originalName}
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Föregående bild"
                  className="absolute left-2 rounded-full bg-black/50 p-2 hover:bg-black/70"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Nästa bild"
                  className="absolute right-2 rounded-full bg-black/50 p-2 hover:bg-black/70"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>

          <div className="space-y-2 px-4 py-3">
            {!editable && photo.caption && <p className="text-sm">{photo.caption}</p>}
            {editable && <CaptionForm key={`${photo.id}:${photo.caption ?? ''}`} photo={photo} />}
            <p className="truncate text-xs text-white/60">{photo.originalName}</p>
          </div>
        </div>
      )}
    </dialog>
  );
}
