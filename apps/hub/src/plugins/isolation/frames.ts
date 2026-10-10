import { z } from 'zod';

export const FRAME = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('call'),
    id: z.number().int(),
    name: z.string(),
    payload: z.unknown(),
  }),
  z.strictObject({
    kind: z.literal('reply'),
    id: z.number().int(),
    ok: z.boolean(),
    payload: z.unknown(),
    error: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal('event'),
    name: z.string(),
    payload: z.unknown(),
  }),
]);

export type Frame = z.output<typeof FRAME>;

export const READY_EVENT = 'ready';

export class ChildCrashedError extends Error {
  override readonly name = 'ChildCrashedError';

  constructor(
    readonly kind: string,
    readonly signal: string | null,
    readonly code: number | null,
  ) {
    super(
      `The ${kind} process stopped unexpectedly (${signal ?? `exit code ${String(code ?? 'unknown')}`})`,
    );
  }
}

export class ChildUnavailableError extends Error {
  override readonly name = 'ChildUnavailableError';

  constructor(
    readonly kind: string,
    reason: string,
  ) {
    super(`The ${kind} process is not available: ${reason}`);
  }
}
