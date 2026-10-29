import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ProjectBudgets } from '@reno/shared';
import { useProjectBudgets, useSaveProjectBudgets } from '../../api/hooks.ts';
import { Modal } from '../../components/Modal.tsx';
import { BudgetBar, Button, Card, QueryState, TextField } from '../../components/ui.tsx';
import { FormActions } from '../../forms/FormActions.tsx';
import { useSubmit } from '../../forms/useSubmit.ts';
import { formatSek, oreToInput, parseKronor } from '../../lib/format.ts';

function BudgetForm({
  projectId,
  budgets,
  onDone,
}: {
  projectId: number;
  budgets: ProjectBudgets;
  onDone: () => void;
}) {
  const save = useSaveProjectBudgets();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(budgets.categories.map((c) => [c.category, oreToInput(c.budgetOre)])),
  );

  // Löpande summa medan man skriver; ogiltiga fält räknas som 0 tills de rättats.
  const parsed = EXPENSE_CATEGORIES.map((c) => (values[c]?.trim() ? parseKronor(values[c]!) : 0));
  const sum = parsed.reduce<number>((s, v) => s + (v ?? 0), 0);
  // Kategorierna är en uppdelning av totalbudgeten: blir summan större höjer servern totalbudgeten till den.
  const exceeds = sum > budgets.projectBudgetOre;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const bad: Record<string, string> = {};
        const out: Record<string, number> = {};
        EXPENSE_CATEGORIES.forEach((c, i) => {
          if (parsed[i] === undefined) bad[c] = 'Ange ett belopp, t.ex. 25 000';
          else if (parsed[i]! > 0) out[c] = parsed[i]!;
        });
        if (Object.keys(bad).length) return setErrors(bad);
        submit(() => save.mutateAsync({ projectId, budgets: out }), onDone);
      }}
    >
      <p className="text-sm text-muted">
        Fördela projektets budget på kategorier. Lämna en kategori tom om den inte ska ha någon egen
        budget.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {EXPENSE_CATEGORIES.map((c) => (
          <TextField
            key={c}
            label={`${EXPENSE_CATEGORY_LABELS[c]} (kr)`}
            value={values[c] ?? ''}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
            error={errors[c]}
            inputMode="decimal"
            placeholder="0"
            autoFocus={c === EXPENSE_CATEGORIES[0]}
          />
        ))}
      </div>
      <p className="text-sm tabular-nums" aria-live="polite">
        Fördelat <span className="font-semibold">{formatSek(sum)}</span>
        {budgets.projectBudgetOre > 0 && !exceeds && (
          <span className="text-muted">
            {' '}
            av projektets budget {formatSek(budgets.projectBudgetOre)}
          </span>
        )}
        {exceeds && (
          <span className="text-muted">
            {' · '}
            {budgets.projectBudgetOre > 0
              ? `projektets budget höjs från ${formatSek(budgets.projectBudgetOre)} till ${formatSek(sum)}`
              : `blir projektets budget`}
          </span>
        )}
      </p>
      <FormActions onCancel={onDone} submitting={submitting} formError={formError} />
    </form>
  );
}

/** Budget mot utfall per kategori (material, verktyg, arbete, övrigt) för ett projekt. */
export function CategoryBudgets({ projectId }: { projectId: number }) {
  const query = useProjectBudgets(projectId);
  const [editing, setEditing] = useState(false);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">Budget per kategori</h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden /> Fördela budget
        </Button>
      </div>
      <QueryState query={query}>
        {(b) => {
          const rows = b.categories.filter((c) => c.budgetOre > 0 || c.spentOre > 0);
          const over = b.allocatedOre - b.projectBudgetOre;
          return (
            <>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">
                  Ingen fördelning ännu. Fördela budgeten på material, verktyg, arbete och övrigt
                  för att se var kostnaderna drar iväg.
                </p>
              ) : (
                <ul className="space-y-4">
                  {rows.map((c) => {
                    const exceeded = c.budgetOre > 0 && c.spentOre > c.budgetOre;
                    return (
                      <li key={c.category}>
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="font-medium">{EXPENSE_CATEGORY_LABELS[c.category]}</span>
                          <span className="tabular-nums">
                            {formatSek(c.spentOre)}
                            {c.budgetOre > 0 ? (
                              <span className="text-muted"> av {formatSek(c.budgetOre)}</span>
                            ) : (
                              <span className="text-muted"> · ingen budget</span>
                            )}
                          </span>
                        </div>
                        <BudgetBar spent={c.spentOre} budget={c.budgetOre} />
                        {exceeded && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            Över budget med {formatSek(c.spentOre - c.budgetOre)}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {b.allocatedOre > 0 && (
                <p className="mt-4 border-t border-line pt-3 text-xs text-muted tabular-nums">
                  Fördelat {formatSek(b.allocatedOre)}
                  {b.projectBudgetOre > 0 &&
                    ` av projektets budget ${formatSek(b.projectBudgetOre)}`}
                  {over < 0 && ` · ${formatSek(-over)} ofördelat`}
                </p>
              )}
              <Modal open={editing} onClose={() => setEditing(false)} title="Fördela budget">
                {editing && (
                  <BudgetForm projectId={projectId} budgets={b} onDone={() => setEditing(false)} />
                )}
              </Modal>
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}
