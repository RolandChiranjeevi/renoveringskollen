import { useState } from 'react';
import { AlertTriangle, Check, FileText, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Quote } from '@reno/shared';
import { ApiError, attachmentUrl } from '../../api/client.ts';
import {
  useAttachments,
  useChooseQuote,
  useContractors,
  useQuotes,
  useSaveQuote,
  useUnchooseQuote,
  useUploadAttachment,
} from '../../api/hooks.ts';
import { FileDropzone } from '../../components/FileDropzone.tsx';
import { Modal } from '../../components/Modal.tsx';
import {
  Button,
  Card,
  cx,
  EmptyState,
  QueryState,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui.tsx';
import { FormActions } from '../../forms/FormActions.tsx';
import { orNull, useSubmit } from '../../forms/useSubmit.ts';
import {
  daysUntil,
  formatBytes,
  formatDate,
  formatSek,
  oreToInput,
  parseKronor,
} from '../../lib/format.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../../lib/undoDelete.tsx';

const OTHER = 'annan';
/** Offerter som går ut inom så här många dagar får en varning. */
const EXPIRING_DAYS = 14;

function QuoteForm({
  projectId,
  quote,
  onDone,
}: {
  projectId: number;
  quote?: Quote;
  onDone: () => void;
}) {
  const save = useSaveQuote();
  const contractors = useContractors();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [from, setFrom] = useState(
    quote?.contractorId ? String(quote.contractorId) : quote ? OTHER : '',
  );
  const [supplierName, setSupplierName] = useState(
    quote?.contractorId ? '' : (quote?.supplierName ?? ''),
  );
  const [amount, setAmount] = useState(oreToInput(quote?.amountOre));
  const [description, setDescription] = useState(quote?.description ?? '');
  const [receivedOn, setReceivedOn] = useState(quote?.receivedOn ?? '');
  const [validUntil, setValidUntil] = useState(quote?.validUntil ?? '');
  const saved = contractors.data ?? [];
  const typedName = from === OTHER || (from === '' && saved.length === 0);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const amountOre = parseKronor(amount);
        if (amountOre === undefined)
          return setErrors({ amountOre: 'Ange ett belopp, t.ex. 85 000' });
        const contractorId = !typedName && from ? Number(from) : null;
        if (!contractorId && !supplierName.trim())
          return setErrors({ supplierName: 'Ange vem offerten kommer från' });
        submit(
          () =>
            save.mutateAsync({
              id: quote?.id,
              projectId,
              contractorId,
              supplierName: contractorId ? null : orNull(supplierName),
              amountOre,
              description: orNull(description),
              receivedOn: orNull(receivedOn),
              validUntil: orNull(validUntil),
            }),
          onDone,
        );
      }}
    >
      {saved.length > 0 && (
        <SelectField
          label="Från vem?"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          error={typedName ? undefined : (errors.contractorId ?? errors.supplierName)}
        >
          <option value="">Välj hantverkare…</option>
          {saved.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={OTHER}>Annan (skriv namn)…</option>
        </SelectField>
      )}
      {typedName && (
        <TextField
          label={saved.length ? 'Namn' : 'Från vem?'}
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          error={errors.supplierName}
          autoFocus
          placeholder="t.ex. Bygg & Kakel AB"
        />
      )}
      <TextField
        label="Pris (kr)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amountOre}
        inputMode="decimal"
        required
        placeholder="0"
        hint="Det totala priset i offerten"
      />
      <TextAreaField
        label="Vad ingår?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        rows={3}
        placeholder="t.ex. Rivning, tätskikt, kakel och montering. Material ingår inte."
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Mottagen"
          type="date"
          value={receivedOn}
          onChange={(e) => setReceivedOn(e.target.value)}
          error={errors.receivedOn}
        />
        <TextField
          label="Gäller till"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          error={errors.validUntil}
        />
      </div>
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}

function validityText(validUntil: string): { text: string; tone: 'ok' | 'warn' | 'danger' } {
  const days = daysUntil(validUntil);
  if (days < 0) return { text: `Gick ut ${formatDate(validUntil)}`, tone: 'danger' };
  if (days === 0) return { text: 'Gäller till och med idag', tone: 'warn' };
  if (days <= EXPIRING_DAYS)
    return {
      text: `Gäller i ${days} ${days === 1 ? 'dag' : 'dagar'} till (${formatDate(validUntil)})`,
      tone: 'warn',
    };
  return { text: `Gäller till ${formatDate(validUntil)}`, tone: 'ok' };
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.details[0]?.message ?? err.message;
  return 'Något gick fel';
}

/** Själva offerten som PDF eller foto, så att den går att öppna direkt från kortet. */
function QuoteDocuments({ quoteId }: { quoteId: number }) {
  const docs = useAttachments({ quoteId });
  const upload = useUploadAttachment();
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('attachment');
  const list = (docs.data ?? []).filter((d) => !hidden.has(d.id));

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <ul className="space-y-1" aria-label="Dokument">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
              <a
                href={attachmentUrl(d.id)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-brand-700 hover:underline"
              >
                {d.originalName}
              </a>
              <span className="shrink-0 text-xs text-muted">{formatBytes(d.sizeBytes)}</span>
              <button
                type="button"
                aria-label={`Ta bort dokumentet ${d.originalName}`}
                onClick={() => scheduleDelete('attachment', d.id, `Dokumentet ”${d.originalName}”`)}
                className="shrink-0 text-muted hover:text-danger pointer-coarse:p-3"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FileDropzone
        inline
        multiple
        label={upload.isPending ? 'Laddar upp…' : 'Bifoga offerten (PDF eller foto)'}
        onFiles={(files) => {
          for (const file of files) upload.mutate({ file, kind: 'offert', quoteId });
        }}
      />
      {upload.error && (
        <p role="alert" className="text-sm text-danger">
          {errorText(upload.error)}
        </p>
      )}
    </div>
  );
}

function QuoteCard({
  quote,
  cheapest,
  onEdit,
}: {
  quote: Quote;
  cheapest: number;
  onEdit: () => void;
}) {
  const choose = useChooseQuote();
  const unchoose = useUnchooseQuote();
  const scheduleDelete = useUndoableDelete();
  const extra = quote.amountOre - cheapest;
  const validity = quote.validUntil ? validityText(quote.validUntil) : undefined;
  const error = choose.error ?? unchoose.error;

  return (
    <Card
      className={cx(
        'flex flex-col gap-3 p-4',
        quote.chosen && 'border-brand-500 ring-2 ring-brand-500/20',
      )}
    >
      <article aria-label={`Offert från ${quote.supplier}`} className="flex flex-1 flex-col gap-3">
        <header className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{quote.supplier}</h3>
          {quote.chosen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              <Check className="size-3.5" aria-hidden /> Vald
            </span>
          )}
        </header>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{formatSek(quote.amountOre)}</p>
          <p className="text-sm text-muted">
            {extra === 0
              ? 'Billigast'
              : `${formatSek(extra)} mer än billigast (+${Math.round((extra / cheapest) * 100)} %)`}
          </p>
        </div>
        {quote.description && <p className="text-sm whitespace-pre-wrap">{quote.description}</p>}
        <div className="mt-auto space-y-0.5 text-xs text-muted">
          {quote.receivedOn && <p>Mottagen {formatDate(quote.receivedOn)}</p>}
          {validity && (
            <p
              className={cx(
                'flex items-center gap-1',
                validity.tone === 'danger' && 'text-danger',
                validity.tone === 'warn' && 'text-warn',
              )}
            >
              {validity.tone !== 'ok' && <AlertTriangle className="size-3.5" aria-hidden />}
              {validity.text}
            </p>
          )}
        </div>
        <QuoteDocuments quoteId={quote.id} />
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/20 bg-danger/5 p-2 text-sm text-danger"
          >
            {errorText(error)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {quote.chosen ? (
            <Button
              variant="secondary"
              size="sm"
              loading={unchoose.isPending}
              onClick={() => unchoose.mutate(quote.id)}
            >
              Ångra val
            </Button>
          ) : (
            <Button
              size="sm"
              loading={choose.isPending}
              aria-label={`Välj offert från ${quote.supplier}`}
              onClick={() =>
                confirm(
                  `Välja offerten från ${quote.supplier}?\n\nProjektets budget blir ${formatSek(quote.amountOre)} och hantverkaren ${quote.supplier}.`,
                ) && choose.mutate(quote.id)
              }
            >
              Välj offert
            </Button>
          )}
          <span className="ml-auto flex">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Redigera offert från ${quote.supplier}`}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="danger"
              size="sm"
              aria-label={`Ta bort offert från ${quote.supplier}`}
              onClick={() => scheduleDelete('quote', quote.id, `Offerten från ${quote.supplier}`)}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </div>
      </article>
    </Card>
  );
}

/** Offerter från flera hantverkare bredvid varandra. Att välja en sätter projektets hantverkare och budget. */
export function QuotesTab({ projectId }: { projectId: number }) {
  const quotes = useQuotes(projectId);
  const hidden = useHiddenIds('quote');
  const [editing, setEditing] = useState<Quote | 'new'>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Jämför offerter från olika hantverkare. Den du väljer blir projektets hantverkare och
          budget.
        </p>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Ny offert
        </Button>
      </div>

      <QueryState query={withoutHidden(quotes, hidden)}>
        {(list) => {
          if (list.length === 0)
            return (
              <EmptyState icon={<FileText className="size-6" />} title="Inga offerter ännu">
                Lägg in de offerter du fått så ser du pris och villkor sida vid sida.
              </EmptyState>
            );
          const cheapest = list[0]!.amountOre;
          return (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
              {list.map((q) => (
                <QuoteCard key={q.id} quote={q} cheapest={cheapest} onEdit={() => setEditing(q)} />
              ))}
            </div>
          );
        }}
      </QueryState>

      <Modal
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={editing === 'new' ? 'Ny offert' : 'Redigera offert'}
      >
        {editing && (
          <QuoteForm
            key={editing === 'new' ? 'new' : editing.id}
            projectId={projectId}
            quote={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Modal>
    </div>
  );
}
