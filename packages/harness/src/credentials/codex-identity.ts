import { z } from 'zod';

export const CODEX_IDENTITY_ID = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, 'Codex identity cannot contain outer whitespace.');
export const CODEX_IDENTITY_CANDIDATE = z.strictObject({
  accountId: CODEX_IDENTITY_ID,
  userId: CODEX_IDENTITY_ID,
});
export type CodexIdentityCandidate = z.infer<typeof CODEX_IDENTITY_CANDIDATE>;
