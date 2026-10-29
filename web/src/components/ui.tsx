import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@reno/shared';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  // I mörkt läge är brand-700 en ljus textfärg, så knappen mörknar i stället för att byta bakgrund.
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:hover:bg-brand-600 dark:hover:brightness-90',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas shadow-sm',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5',
  // Grå tills man pekar på den: röda papperskorgar överallt gör sidorna oroliga.
  danger: 'text-muted hover:text-danger hover:bg-danger/10 focus-visible:text-danger',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        // På pekskärmar ska träffytan vara minst 44 px.
        size === 'sm'
          ? 'h-8 px-2.5 text-sm pointer-coarse:h-11 pointer-coarse:min-w-11'
          : 'h-10 px-4 text-sm pointer-coarse:h-11',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl border border-line bg-surface shadow-sm', className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted/60 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-danger';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
}

export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={msgId} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type WithField<T> = T & { label: string; error?: string; hint?: string; className?: string };

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: WithField<InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={inputClass}
          {...props}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...props
}: WithField<TextareaHTMLAttributes<HTMLTextAreaElement>>) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={3}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={inputClass}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...props
}: WithField<SelectHTMLAttributes<HTMLSelectElement>>) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={inputClass}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

const statusStyles: Record<ProjectStatus, string> = {
  planerad:
    'bg-ink/10 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700',
  pagaende:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  klar: 'bg-brand-50 text-brand-700 ring-brand-100',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        statusStyles[status],
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

/** Stapel för budget mot utfall. Blir röd när budgeten överskrids. */
export function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  if (budget <= 0) return null;
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  const over = spent > budget;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
      role="meter"
      aria-label="Andel av budget"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={spent}
    >
      <div
        className={cx(
          'h-full rounded-full transition-all',
          over ? 'bg-danger' : pct > 85 ? 'bg-warn' : 'bg-brand-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Neutral stapel för andel av en helhet (t.ex. rum jämfört med största rummet). */
export function ShareBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
      role="img"
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Något gick fel';
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function Spinner({ label = 'Laddar…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** Visar laddning/fel för en query och renderar barnen först när data finns. */
export function QueryState<T>({
  query,
  children,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Spinner />;
  if (query.error) return <ErrorBox error={query.error} />;
  return <>{children(query.data as T)}</>;
}
