import { useRef, useState } from 'react';
import { Paperclip, Upload } from 'lucide-react';
import { cx } from './ui.tsx';

export const ACCEPTED_FILES = 'image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
  compact?: boolean;
  /** Liten länk i stället för en stor yta – för platser där uppladdning är ett tillval. */
  inline?: boolean;
}

export function FileDropzone({
  onFiles,
  multiple = false,
  label = 'Dra hit filer eller klicka för att välja',
  compact,
  inline,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();

  const accept = (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const tooBig = files.filter((f) => f.size > MAX_BYTES);
    setError(
      tooBig.length
        ? `För stor fil (max 10 MB): ${tooBig.map((f) => f.name).join(', ')}`
        : undefined,
    );
    const ok = files.filter((f) => f.size <= MAX_BYTES);
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };

  const hiddenInput = (
    <input
      ref={input}
      type="file"
      accept={ACCEPTED_FILES}
      multiple={multiple}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        accept(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (inline) {
    return (
      <div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md py-1.5 text-sm font-medium text-brand-700 hover:underline pointer-coarse:py-3"
        >
          <Paperclip className="size-4" aria-hidden /> {label}
        </button>
        {hiddenInput}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        className={cx(
          'flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm transition-colors',
          compact ? 'px-3 py-4' : 'px-4 py-8',
          dragging
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-line text-muted hover:border-brand-500/50 hover:bg-canvas',
        )}
      >
        <Upload className="size-5" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="text-xs">JPEG, PNG, WebP, HEIC eller PDF · max 10 MB</span>
      </button>
      {hiddenInput}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
