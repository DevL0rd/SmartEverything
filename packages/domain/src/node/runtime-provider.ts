import { z } from 'zod';
import { CODEX_PROVIDER_OPTIONS, CODEX_LIFECYCLE, CODEX_ID, CODEX_USAGE } from '../codex';
import { CODEX_ANSWER, CODEX_PROMPT } from '../codex-prompts';
import { PROVIDER_EXECUTION_CONTEXT } from '../computer-ai-runtime';
import { AI_AGENT_RUN } from '../ai-agent-runs';
import { JSON_VALUE } from '../values';
import { PROVIDER_TURN, PROVIDER_EVENT, PROVIDER_ANSWER } from './provider-turns';
import { PROVIDER_CONTROL, PROVIDER_READ_QUERY, PROVIDER_METADATA } from './provider-controls';

export const CODEX_PROVIDER_TURN = PROVIDER_TURN.omit({ options: true }).extend({
  options: CODEX_PROVIDER_OPTIONS,
});
export type CodexProviderTurn = z.infer<typeof CODEX_PROVIDER_TURN>;
export const COMPUTER_RUNTIME_PROVIDER_TURN = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), turn: PROVIDER_TURN }),
  z.strictObject({ runtime: z.literal('codex'), turn: CODEX_PROVIDER_TURN }),
]);
export type ComputerRuntimeProviderTurn = z.infer<typeof COMPUTER_RUNTIME_PROVIDER_TURN>;
export const CODEX_PROVIDER_CONTROL = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('close') }),
  z.strictObject({
    action: z.literal('set_model'),
    model: CODEX_ID,
    effort: z.string().min(1).max(32).nullable(),
  }),
  z.strictObject({ action: z.literal('set_options'), options: CODEX_PROVIDER_OPTIONS }),
  z.strictObject({
    action: z.literal('rename_session'),
    session_id: CODEX_ID,
    title: z.string().min(1).max(500),
  }),
  z.strictObject({ action: z.literal('fork_session'), session_id: CODEX_ID }),
  z.strictObject({ action: z.literal('archive_session'), session_id: CODEX_ID }),
  z.strictObject({ action: z.literal('unarchive_session'), session_id: CODEX_ID }),
  z.strictObject({ action: z.literal('delete_session'), session_id: CODEX_ID }),
]);
export const CODEX_PROVIDER_READ_QUERY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('context') }),
  z.strictObject({ kind: z.literal('usage') }),
  z.strictObject({ kind: z.literal('mcp_status') }),
  z.strictObject({ kind: z.literal('tasks') }),
  z.strictObject({
    kind: z.literal('file'),
    path: z.string().min(1).max(4096),
    max_bytes: z.int().min(1).max(4_194_304).default(1_048_576),
  }),
  z.strictObject({ kind: z.literal('sessions'), limit: z.int().min(1).max(200).default(100) }),
  z.strictObject({
    kind: z.literal('session_messages'),
    session_id: CODEX_ID,
    limit: z.int().min(1).max(200).default(100),
  }),
]);
export const CODEX_PROVIDER_METADATA = PROVIDER_METADATA;
const BASE = {
  job_id: z.uuid(),
  chat_id: z.uuid(),
  seq: z.int().positive(),
  process_generation: z.uuid(),
  thread_id: CODEX_ID.nullable(),
  turn_id: CODEX_ID.nullable(),
  item_id: CODEX_ID.nullable(),
};
export const CODEX_PROVIDER_EVENT = z.discriminatedUnion('kind', [
  z.strictObject({ ...BASE, kind: z.literal('accepted'), session_id: CODEX_ID }),
  z.strictObject({ ...BASE, kind: z.literal('context'), context: PROVIDER_EXECUTION_CONTEXT }),
  z.strictObject({
    ...BASE,
    kind: z.literal('lifecycle'),
    state: CODEX_LIFECYCLE,
    reason: z.string().max(2000).nullable(),
  }),
  z.strictObject({ ...BASE, kind: z.literal('text'), delta: z.string().max(64_000) }),
  z.strictObject({ ...BASE, kind: z.literal('thinking'), delta: z.string().max(64_000) }),
  z.strictObject({
    ...BASE,
    kind: z.literal('tool_call'),
    call_id: CODEX_ID,
    name: CODEX_ID,
    input: z.record(z.string(), JSON_VALUE),
    origin: z.enum(['computer', 'hub']),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('tool_result'),
    call_id: CODEX_ID,
    text: z.string().max(200_000),
    failed: z.boolean(),
    origin: z.enum(['computer', 'hub']),
  }),
  z.strictObject({ ...BASE, kind: z.literal('prompt'), prompt: CODEX_PROMPT }),
  z.strictObject({ ...BASE, kind: z.literal('prompt_resolved'), prompt_id: CODEX_ID }),
  z.strictObject({ ...BASE, kind: z.literal('usage'), usage: CODEX_USAGE }),
  z.strictObject({
    ...BASE,
    kind: z.literal('rate_limit'),
    status: z.enum(['allowed', 'allowed_warning', 'rejected']),
    resets_at: z.iso.datetime({ offset: true }).nullable(),
    detail: z.string().max(500),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('work_item'),
    type: CODEX_ID,
    payload: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('unsupported_item'),
    type: CODEX_ID,
    summary: z.string().max(16_000),
    truncated: z.boolean(),
  }),
  z.strictObject({ ...BASE, kind: z.literal('agent'), run: AI_AGENT_RUN }),
  z.strictObject({
    ...BASE,
    kind: z.literal('completed'),
    session_id: CODEX_ID,
    interrupted: z.boolean(),
  }),
  z.strictObject({
    ...BASE,
    kind: z.literal('failed'),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(2000),
  }),
]);
export type CodexProviderEvent = z.infer<typeof CODEX_PROVIDER_EVENT>;
export const COMPUTER_RUNTIME_PROVIDER_EVENT = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), event: PROVIDER_EVENT }),
  z.strictObject({ runtime: z.literal('codex'), event: CODEX_PROVIDER_EVENT }),
]);
export type ComputerRuntimeProviderEvent = z.infer<typeof COMPUTER_RUNTIME_PROVIDER_EVENT>;
export const COMPUTER_RUNTIME_PROVIDER_CONTROL = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), control: PROVIDER_CONTROL }),
  z.strictObject({ runtime: z.literal('codex'), control: CODEX_PROVIDER_CONTROL }),
]);
export const COMPUTER_RUNTIME_PROVIDER_READ = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), query: PROVIDER_READ_QUERY }),
  z.strictObject({ runtime: z.literal('codex'), query: CODEX_PROVIDER_READ_QUERY }),
]);
export const COMPUTER_RUNTIME_PROVIDER_ANSWER = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), answer: PROVIDER_ANSWER }),
  z.strictObject({ runtime: z.literal('codex'), answer: CODEX_ANSWER }),
]);
