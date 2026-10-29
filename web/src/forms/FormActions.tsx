import { Button, ErrorBox } from '../components/ui.tsx';

export function FormActions({
  onCancel,
  submitting,
  formError,
  submitLabel = 'Spara',
}: {
  onCancel: () => void;
  submitting: boolean;
  formError?: string;
  submitLabel?: string;
}) {
  return (
    <div className="space-y-3 pt-2">
      {formError && <ErrorBox error={new Error(formError)} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
