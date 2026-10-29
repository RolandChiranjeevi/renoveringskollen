import type { z } from 'zod';
import { HttpError } from './errors.ts';

/** Validerar indata mot ett Zod-schema eller kastar 400 med fältfel. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', details);
}
