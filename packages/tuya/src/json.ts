import { z } from 'zod';

export type Reject = (reason: string) => Error;

export function readJson(text: string, what: string, reject: Reject): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw reject(`the ${what} is not JSON (${String(cause)})`);
  }
}

export function fit<S extends z.ZodType>(
  schema: S,
  candidate: unknown,
  what: string,
  reject: Reject,
): z.output<S> {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw reject(`the ${what} does not fit: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
