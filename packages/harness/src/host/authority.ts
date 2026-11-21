import { z } from 'zod';

export const HARNESS_AUTHORITY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual'), profileId: z.uuid() }),
  z.strictObject({ kind: z.literal('trigger'), profileId: z.uuid(), grantId: z.uuid() }),
]);
export type HarnessAuthority = z.infer<typeof HARNESS_AUTHORITY>;
