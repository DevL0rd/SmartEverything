import { z } from 'zod';
import { CODEX_ID, CODEX_RPC_ID } from './codex';
import { JSON_VALUE } from './values';

const BASE = {
  id: CODEX_ID,
  rpc_id: CODEX_RPC_ID,
  thread_id: CODEX_ID.nullable(),
  turn_id: CODEX_ID.nullable(),
  item_id: CODEX_ID.nullable(),
  status: z.enum(['pending', 'answered', 'expired']),
  title: z.string().max(500),
  payload: z.record(z.string(), JSON_VALUE),
};
export const CODEX_APPROVAL_CHOICE = z.strictObject({
  id: z.string().min(1).max(200),
  label: z.string().max(500),
  value: JSON_VALUE,
});
export const CODEX_PROMPT = z.discriminatedUnion('kind', [
  z.strictObject({
    ...BASE,
    kind: z.literal('command_approval'),
    choices: z.array(CODEX_APPROVAL_CHOICE).max(20),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('file_approval'),
    choices: z.array(CODEX_APPROVAL_CHOICE).max(20),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('permissions_approval'),
    choices: z.array(CODEX_APPROVAL_CHOICE).max(20),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('user_input'),
    questions: z
      .array(
        z.strictObject({
          id: CODEX_ID,
          header: z.string().max(200),
          question: z.string().max(16_000),
          options: z
            .array(
              z.strictObject({ label: z.string().max(500), description: z.string().max(2000) }),
            )
            .max(100)
            .nullable(),
          is_other: z.boolean(),
          is_secret: z.boolean(),
        }),
      )
      .max(100),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('mcp_form'),
    schema: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ ...BASE, kind: z.literal('mcp_url'), url: z.url().max(4096) }),
  z.strictObject({ ...BASE, kind: z.literal('unsupported'), reason: z.string().min(1).max(2000) }),
]);
export type CodexPrompt = z.infer<typeof CODEX_PROMPT>;
export const CODEX_ANSWER = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('approval'), choice_id: CODEX_ID }),
  z.strictObject({
    kind: z.literal('user_input'),
    answers: z.record(z.string().min(1).max(200), z.array(z.string().max(16_000)).max(100)),
  }),
  z.strictObject({
    kind: z.literal('elicitation'),
    action: z.enum(['accept', 'decline', 'cancel']),
    content: z.record(z.string(), JSON_VALUE).optional(),
  }),
]);
export type CodexAnswer = z.infer<typeof CODEX_ANSWER>;
export const CODEX_NATIVE_NOTICE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('codex_session'),
    session: z.lazy(() => CODEX_ID),
    payload: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ type: z.literal('codex_prompt'), prompt: CODEX_PROMPT }),
  z.strictObject({
    type: z.literal('codex_operation'),
    operation: z.uuid(),
    payload: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ type: z.literal('codex_changed'), reason: z.string().max(500) }),
]);
