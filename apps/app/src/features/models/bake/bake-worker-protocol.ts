import { z } from 'zod';

export const TO_BAKE_WORKER = z.strictObject({ kind: z.literal('bake'), text: z.string() });

export const FROM_BAKE_WORKER = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({ kind: z.literal('unavailable'), detail: z.string() }),
  z.strictObject({ kind: z.literal('lost') }),
  z.strictObject({ kind: z.literal('result'), text: z.string() }),
]);

export type FromBakeWorker = z.infer<typeof FROM_BAKE_WORKER>;
