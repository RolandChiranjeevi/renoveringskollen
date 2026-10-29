import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Bygger på <dialog>: fokusfälla, Esc och tillgänglighet kommer från webbläsaren.
export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="modal-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Stäng"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
