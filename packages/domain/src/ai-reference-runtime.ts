import { z } from 'zod';
import { AI_REFERENCE, AI_REFERENCE_SEARCH, AI_REFERENCE_SUMMARY } from './ai-references';

export const AI_NATIVE_REFERENCE_ACTION = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('search'), search: AI_REFERENCE_SEARCH }),
  z.strictObject({ action: z.literal('resolve'), references: z.array(AI_REFERENCE).max(20) }),
  z.strictObject({ action: z.literal('close'), cursor: z.uuid() }),
]);
export type AiNativeReferenceAction = z.infer<typeof AI_NATIVE_REFERENCE_ACTION>;
export const AI_NATIVE_REFERENCE_RESULT = z.object({
  items: z.array(AI_REFERENCE_SUMMARY).max(50),
  revision: z.string().min(1).max(300),
  next_cursor: z.uuid().nullable(),
  incomplete: z.boolean(),
});
export type AiNativeReferenceResult = z.infer<typeof AI_NATIVE_REFERENCE_RESULT>;
