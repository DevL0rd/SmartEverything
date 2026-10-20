import type { z } from 'zod';
import { ReadFailure, type ReadInputs } from './read-port';

export function parseInputs<S extends z.ZodType>(
  kind: string,
  schema: S,
  inputs: ReadInputs,
): z.output<S> {
  const parsed = schema.safeParse(inputs);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join('.') || 'inputs'}: ${issue.message}`)
    .join('; ');
  throw new ReadFailure('Invalid', `${kind} was given inputs it cannot read (${problems})`);
}
