import { z } from 'zod';
import { AI_HARNESS_TARGET, AI_HARNESS_PERMISSION } from './ai-harness';
import { DSH_SESSION_ID } from './dsh-sessions';

export const AI_AGENT_STATES = [
  'queued',
  'running',
  'waiting',
  'stopping',
  'completed',
  'stopped',
  'interrupted',
  'failed',
  'unknown',
] as const;
export const AI_AGENT_ACTION = z.enum(['interrupt', 'send', 'steer', 'open_chat']);
export const AI_AGENT_USAGE = z.strictObject({
  input_tokens: z.int().nonnegative().nullable(),
  output_tokens: z.int().nonnegative().nullable(),
  total_tokens: z.int().nonnegative().nullable(),
  cost_usd: z.number().nonnegative().nullable(),
  generation_id: z.string().min(1).max(200).nullable().optional(),
  cache_read_tokens: z.int().nonnegative().nullable().optional(),
  cache_write_tokens: z.int().nonnegative().nullable().optional(),
  reasoning_tokens: z.int().nonnegative().nullable().optional(),
  duration_ms: z.int().nonnegative().nullable(),
  tool_uses: z.int().nonnegative().nullable(),
});
export const AI_AGENT_RUN = z.strictObject({
  id: z.uuid(),
  parent_chat_id: z.uuid(),
  profile_id: z.uuid(),
  source: z.enum(['smarteverything', 'claude', 'codex', 'dsh']),
  source_id: z.string().min(1).max(1000),
  parent_run_id: z.uuid().nullable(),
  child_chat_id: z.uuid().nullable(),
  device_id: z.uuid().nullable(),
  runtime: z.enum(['claude', 'codex', 'dsh']).nullable(),
  session_id: z.string().min(1).max(200).nullable(),
  job_id: z.uuid().nullable(),
  source_generation: z.string().min(1).max(200).nullable(),
  source_seq: z.int().nonnegative(),
  source_revision: z.int().nonnegative(),
  title: z.string().min(1).max(500),
  task: z.string().max(200_000).nullable(),
  state: z.enum(AI_AGENT_STATES),
  last_known_state: z.enum(AI_AGENT_STATES).nullable(),
  observability_reason: z.string().max(2000).nullable(),
  progress: z.string().max(16_000).nullable(),
  result: z.string().max(200_000).nullable(),
  error: z.string().max(16_000).nullable(),
  model: z.string().max(200).nullable(),
  effort: z.string().max(32).nullable(),
  cwd: z.string().max(4096).nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  updated_at: z.iso.datetime({ offset: true }),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  usage: AI_AGENT_USAGE.nullable(),
  supported_actions: z.array(AI_AGENT_ACTION).max(4),
  truncated: z.boolean(),
  harness: z
    .object({
      session_id: DSH_SESSION_ID,
      parent_session_id: DSH_SESSION_ID,
      target: AI_HARNESS_TARGET,
      model_route_id: z.uuid(),
      permission: AI_HARNESS_PERMISSION,
      operation_id: z.uuid(),
      parent_delivery_id: z.uuid(),
      writer_epoch: z.int().positive(),
    })
    .optional(),
});
export type AiAgentRun = z.infer<typeof AI_AGENT_RUN>;
export type AiAgentState = z.infer<typeof AI_AGENT_RUN>['state'];
export const AI_AGENT_RUN_PAGE = z.strictObject({
  runs: z.array(AI_AGENT_RUN).max(200),
  next_cursor: z.string().max(200).nullable(),
});
export const AI_AGENT_RUN_CONTROL = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('interrupt') }),
  z.strictObject({ action: z.literal('send'), text: z.string().min(1).max(200_000) }),
  z.strictObject({
    action: z.literal('steer'),
    text: z.string().min(1).max(200_000),
    expected_turn_id: z.string().min(1).max(200),
  }),
]);
export const AI_AGENT_TRACE = z.strictObject({
  seq: z.int().positive(),
  kind: z.enum(['text', 'tool', 'progress', 'lifecycle']),
  text: z.string().max(16_000),
  created_at: z.iso.datetime({ offset: true }),
});
export const AI_AGENT_RUN_DETAIL = z.strictObject({
  run: AI_AGENT_RUN,
  trace: z.array(AI_AGENT_TRACE).max(200),
  next_cursor: z.string().max(200).nullable(),
  truncated: z.boolean(),
});
