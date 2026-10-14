import { z } from 'zod';
import { CLAUDE_ANSWER, CLAUDE_PROMPT } from '../claude';
import { CLAUDE_PROVIDER_OPTIONS, NATIVE_MANAGED_PROJECT } from '../computer-ai';
import { JSON_VALUE } from '../values';

export const PROVIDER_TURN_MAX_BYTES = 32 * 1024 * 1024 - 1024;

export const PROVIDER_CONTENT = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(200_000) }),
  z.strictObject({
    type: z.literal('image'),
    media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
    data: z.string().min(1).max(28_000_000),
  }),
  z.strictObject({
    type: z.literal('document'),
    media_type: z.literal('application/pdf'),
    data: z.string().min(1).max(28_000_000),
  }),
]);
export type ProviderContent = z.infer<typeof PROVIDER_CONTENT>;
export const PROVIDER_TURN = z.strictObject({
  managed_project: NATIVE_MANAGED_PROJECT.optional(),
  job_id: z.uuid(),
  device_id: z.uuid(),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  model: z.string().min(1).max(200),
  effort: z.string().min(1).max(32).nullable(),
  session_id: z.string().min(1).max(200).nullable(),
  system: z.string().max(200_000),
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: z.array(PROVIDER_CONTENT).min(1).max(64),
      }),
    )
    .min(1)
    .max(500),
  tools: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
        input_schema: z.record(z.string(), JSON_VALUE),
      }),
    )
    .max(500),
  options: CLAUDE_PROVIDER_OPTIONS,
});
export type ProviderTurn = z.infer<typeof PROVIDER_TURN>;
export const PROVIDER_ACCEPTED = z.strictObject({
  job_id: z.uuid(),
  session_id: z.string().min(1).max(200).nullable(),
});
export const PROVIDER_ANSWER = z.union([
  z.strictObject({
    decision: z.literal('question'),
    answers: z.record(z.string().min(1).max(2000), z.string().min(1).max(10_000)),
  }),
  CLAUDE_ANSWER,
  z.strictObject({ decision: z.literal('cancel') }),
  z.strictObject({ decision: z.literal('dialog'), response: z.record(z.string(), JSON_VALUE) }),
  z.strictObject({
    decision: z.literal('elicitation'),
    action: z.enum(['accept', 'decline', 'cancel']),
    content: z.record(z.string(), JSON_VALUE).optional(),
  }),
]);
export type ProviderAnswer = z.infer<typeof PROVIDER_ANSWER>;
const BASE = { job_id: z.uuid(), chat_id: z.uuid(), seq: z.int().positive() };
export const PROVIDER_EVENT = z.discriminatedUnion('kind', [
  z.strictObject({ ...BASE, kind: z.literal('accepted'), session_id: z.string().min(1).max(200) }),
  z.strictObject({
    ...BASE,
    kind: z.literal('runtime'),
    type: z.string().min(1).max(200),
    payload: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ ...BASE, kind: z.literal('text'), delta: z.string().max(64_000) }),
  z.strictObject({ ...BASE, kind: z.literal('thinking'), delta: z.string().max(64_000) }),
  z.strictObject({
    ...BASE,
    kind: z.literal('tool_call'),
    call_id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    input: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('tool_result'),
    call_id: z.string().min(1).max(200),
    text: z.string().max(200_000),
    failed: z.boolean(),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('dialog'),
    status: z.enum(['pending', 'answered', 'expired']).optional(),
    prompt_id: z.string().min(1).max(200),
    dialog_kind: z.string().min(1).max(100),
    request: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ ...BASE, kind: z.literal('prompt'), prompt: CLAUDE_PROMPT }),
  z.strictObject({
    ...BASE,
    kind: z.literal('usage'),
    input_tokens: z.int().nonnegative(),
    output_tokens: z.int().nonnegative(),
    cache_read_tokens: z.int().nonnegative(),
    cache_write_tokens: z.int().nonnegative(),
    cost_usd: z.number().nonnegative().nullable(),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('rate_limit'),
    status: z.enum(['allowed', 'allowed_warning', 'rejected']),
    resets_at: z.iso.datetime({ offset: true }).nullable(),
    detail: z.string().max(500),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('completed'),
    session_id: z.string().min(1).max(200),
    interrupted: z.boolean(),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('failed'),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(2000),
  }),
]);
export type ProviderEvent = z.infer<typeof PROVIDER_EVENT>;
