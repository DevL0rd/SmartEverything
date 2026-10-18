import { z } from 'zod';
import { AI_HARNESS_PERMISSION, AI_HARNESS_STORAGE_BINDING } from './ai-harness';
import { AI_HARNESS_INTERACTION, AI_HARNESS_WORK } from './ai-harness-session';
import { DSH_SESSION_ID } from './dsh-sessions';

const COUNT = z.int().nonnegative();
const BOUND = { session_id: DSH_SESSION_ID, epoch: z.int().positive() };

export const HARNESS_NATIVE_USAGE = z.object({
  inputTokens: COUNT,
  outputTokens: COUNT,
  totalTokens: COUNT.optional(),
  cacheReadTokens: COUNT.optional(),
  cacheWriteTokens: COUNT.optional(),
  reasoningTokens: COUNT.optional(),
});
export const HARNESS_NATIVE_FRAME = z.discriminatedUnion('kind', [
  z.strictObject({ ...BOUND, kind: z.literal('open') }),
  z.strictObject({ ...BOUND, kind: z.literal('close') }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('input'),
    message_id: z.string().min(1),
    turn: COUNT,
  }),
  z.strictObject({ ...BOUND, kind: z.literal('discarded'), message_id: z.string().min(1) }),
  z.strictObject({ ...BOUND, kind: z.literal('text'), delta: z.string() }),
  z.strictObject({ ...BOUND, kind: z.literal('reasoning'), delta: z.string() }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('attempt'),
    id: z.string().min(1),
    state: z.enum(['started', 'committed', 'discarded']),
  }),
  z.strictObject({ ...BOUND, kind: z.literal('usage'), usage: HARNESS_NATIVE_USAGE }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('status'),
    status: z.enum(['idle', 'running']),
    work: z.array(AI_HARNESS_WORK),
  }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('commands'),
    revision: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  z.strictObject({ ...BOUND, kind: z.literal('context'), estimate: COUNT.nullable() }),
  z.strictObject({ ...BOUND, kind: z.literal('error'), message: z.string() }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('interactions'),
    interactions: z.array(AI_HARNESS_INTERACTION),
    added: AI_HARNESS_INTERACTION.nullable(),
  }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('workspace'),
    storage_binding: AI_HARNESS_STORAGE_BINDING,
  }),
  z.strictObject({
    ...BOUND,
    kind: z.literal('permission'),
    operation_id: z.uuid(),
    permission: AI_HARNESS_PERMISSION,
  }),
]);
export type HarnessNativeUsage = z.infer<typeof HARNESS_NATIVE_USAGE>;
export type HarnessNativeFrame = z.infer<typeof HARNESS_NATIVE_FRAME>;
