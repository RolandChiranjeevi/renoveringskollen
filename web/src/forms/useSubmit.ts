import { useState } from 'react';
import { ApiError } from '../api/client.ts';

/** Kör ett formulärs sparfunktion och fördelar serverns fel på fält respektive formuläret. */
export function useSubmit() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(fn: () => Promise<unknown>, onDone?: () => void) {
    setErrors({});
    setFormError(undefined);
    setSubmitting(true);
    try {
      await fn();
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        setErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(err.message);
      } else {
        setFormError('Något gick fel');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { errors, setErrors, formError, submitting, submit };
}

/** Tom sträng → null, för valfria fält. */
export const orNull = (v: string) => (v.trim() === '' ? null : v.trim());
