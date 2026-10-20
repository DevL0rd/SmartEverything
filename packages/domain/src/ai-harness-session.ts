import { z } from 'zod';
import {
  AI_HARNESS_TARGET,
  AI_HARNESS_STORAGE_BINDING,
  AI_HARNESS_TARGET_WRITE,
  harnessTargetKey,
  AI_HARNESS_PERMISSION,
  AI_HARNESS_PERMISSION_WRITE,
  DEFAULT_AI_HARNESS_PERMISSION,
  AI_HARNESS_FAILURE,
} from './ai-harness';
import { DSH_SESSION_ID, DSH_SESSION_METADATA } from './dsh-sessions';
import { AI_MODEL_ROUTE_SELECTION, AI_MODEL_ROUTE_SELECTION_WRITE } from './ai-model-route';
import { JSON_VALUE } from './values';
import { HARNESS_SANDBOX_ENFORCEMENT } from './harness-platform';
import { AI_AGENT_RUN, AI_AGENT_USAGE } from './ai-agent-runs';

export * from './dsh-sessions';

export const DSH_ENGINE_FIELDS = {
  kind: z.literal('dsh'),
  execution_target: AI_HARNESS_TARGET,
  session_id: DSH_SESSION_ID.nullable(),
  model_route_id: z.uuid(),
  model: z.string().trim().min(1).max(200),
  effort: z.string().trim().min(1).max(32).nullable().default(null),
  permission: AI_HARNESS_PERMISSION.default(DEFAULT_AI_HARNESS_PERMISSION),
};
export const DSH_ENGINE = z.object(DSH_ENGINE_FIELDS);
export const DSH_ENGINE_WRITE = z.strictObject({
  ...DSH_ENGINE_FIELDS,
  execution_target: AI_HARNESS_TARGET_WRITE,
  permission: AI_HARNESS_PERMISSION_WRITE.default(DEFAULT_AI_HARNESS_PERMISSION),
});
export type DshEngine = z.output<typeof DSH_ENGINE>;

export const AI_HARNESS_PATH = z.object({
  target: AI_HARNESS_TARGET,
  path: z.string().min(1).max(4096),
});
export const AI_HARNESS_PATH_WRITE = AI_HARNESS_PATH.strict().extend({
  target: AI_HARNESS_TARGET_WRITE,
});
export type AiHarnessPath = z.infer<typeof AI_HARNESS_PATH>;

export const AI_HARNESS_INTERACTION = z.object({
  id: z.string().min(1).max(200),
  epoch: z.int().positive(),
  kind: z.enum(['permission', 'question', 'elicitation']),
  request: JSON_VALUE,
});
export type AiHarnessInteraction = z.infer<typeof AI_HARNESS_INTERACTION>;
export const AI_HARNESS_ANSWER = z.strictObject({
  operation_id: z.uuid(),
  interaction_id: z.string().min(1).max(200),
  expected_epoch: z.int().positive(),
  answer: JSON_VALUE,
});
export type AiHarnessAnswer = z.infer<typeof AI_HARNESS_ANSWER>;
export const AI_HARNESS_PERMISSION_CHANGE = z.strictObject({
  operation_id: z.uuid(),
  expected_epoch: z.int().positive(),
  permission: AI_HARNESS_PERMISSION_WRITE,
});
export type AiHarnessPermissionChange = z.infer<typeof AI_HARNESS_PERMISSION_CHANGE>;

export const AI_HARNESS_WORK = z.object({
  kind: z.enum(['turn', 'interaction', 'child', 'shell', 'compaction', 'delivery', 'cleanup']),
  id: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
});
export const AI_HARNESS_HANDOFF_REQUEST = z
  .strictObject({
    operation_id: z.uuid(),
    target: AI_HARNESS_TARGET_WRITE,
    directory: AI_HARNESS_PATH_WRITE.optional(),
    route: AI_MODEL_ROUTE_SELECTION_WRITE,
  })
  .refine(
    (request) =>
      request.directory === undefined ||
      harnessTargetKey(request.directory.target) === harnessTargetKey(request.target),
    'The selected directory must belong to the target execution host.',
  );
export type AiHarnessHandoffRequest = z.infer<typeof AI_HARNESS_HANDOFF_REQUEST>;
export const AI_HARNESS_SWITCH_RESULT = z.object({
  state: z.enum(['applied', 'pending', 'cleared']),
  execution_target: AI_HARNESS_TARGET,
  pending_execution_target: AI_HARNESS_TARGET.nullable(),
});
export type AiHarnessSwitchResult = z.infer<typeof AI_HARNESS_SWITCH_RESULT>;
export const AI_MACHINE = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  os: z.enum(['Linux', 'Windows', 'macOS']),
  sandbox: HARNESS_SANDBOX_ENFORCEMENT.optional(),
  online: z.boolean(),
  current: z.boolean(),
});
export const AI_MACHINE_LIST = z.object({ machines: z.array(AI_MACHINE).max(200) });
export type AiMachineList = z.infer<typeof AI_MACHINE_LIST>;
export const AI_MACHINE_SWITCH = z.strictObject({
  machine: z.string().trim().min(1).max(200).describe('Machine id or name from list_machines'),
});
export const AI_MACHINE_SWITCH_RESULT = z.object({
  state: z.enum(['applied', 'pending', 'cleared']),
  machine: z.string().min(1).max(200),
});
export type AiMachineSwitchResult = z.infer<typeof AI_MACHINE_SWITCH_RESULT>;

export const AI_HARNESS_SESSION = z
  .object({
    chat_id: z.uuid(),
    session_id: DSH_SESSION_ID,
    metadata: DSH_SESSION_METADATA,
    target: AI_HARNESS_TARGET,
    epoch: z.int().positive().nullable(),
    directory: AI_HARNESS_PATH.nullable(),
    storage_binding: AI_HARNESS_STORAGE_BINDING.optional(),
    permission: AI_HARNESS_PERMISSION,
    permission_change: AI_HARNESS_PERMISSION_CHANGE.nullable().optional(),
    route: AI_MODEL_ROUTE_SELECTION,
    state: z.enum(['idle', 'working', 'waiting', 'switching', 'unavailable', 'failed']),
    reconnecting: z.boolean().optional(),
    context_request: z
      .object({
        id: z.uuid(),
        epoch: z.int().positive(),
        provider: z.string().min(1),
        model: z.string().min(1),
        capacity_tokens: z.int().positive(),
      })
      .optional(),
    context: z
      .object({
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        capacity_tokens: z.int().positive().nullable(),
        input_tokens: z.int().nonnegative().nullable(),
        estimate_tokens: z.int().nonnegative().nullable().optional(),
        state: z.enum(['unmeasured', 'measured', 'compacting', 'stale']),
      })
      .optional(),
    commands_revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    interactions: z.array(AI_HARNESS_INTERACTION).max(200),
    work: z.array(AI_HARNESS_WORK).max(200),
    failure: AI_HARNESS_FAILURE.nullable(),
  })
  .refine(
    (session) =>
      session.session_id === session.metadata.header.id &&
      session.chat_id === session.metadata.chat_id,
    'The native session metadata must belong to this session and chat.',
  );
export type AiHarnessSession = z.infer<typeof AI_HARNESS_SESSION>;

export function harnessContextPercent(context: AiHarnessSession['context']): number | null {
  if (context === undefined) return null;
  const input =
    context.state === 'stale' &&
    context.estimate_tokens !== undefined &&
    context.estimate_tokens !== null
      ? context.estimate_tokens
      : context.input_tokens;
  if (context.capacity_tokens === null || input === null) return null;
  return Math.min(100, (input / context.capacity_tokens) * 100);
}

const EVENT_FIELDS = {
  session_id: DSH_SESSION_ID,
  chat_id: z.uuid(),
  epoch: z.int().positive(),
  seq: z.int().nonnegative(),
  delivery_id: z.uuid().optional(),
  native_turn: z.int().positive().optional(),
};
export const AI_HARNESS_EVENT = z.discriminatedUnion('kind', [
  z.object({ ...EVENT_FIELDS, kind: z.literal('text'), delta: z.string().max(16_000) }),
  z.object({ ...EVENT_FIELDS, kind: z.literal('reasoning'), delta: z.string().max(16_000) }),
  z.object({
    ...EVENT_FIELDS,
    kind: z.literal('tool'),
    call_id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    state: z.enum(['running', 'completed', 'failed', 'unknown']),
    target: AI_HARNESS_TARGET,
    detail: z.string().max(16_000).nullable(),
    input: z.string().optional(),
    output: z.string().optional(),
  }),
  z.object({
    ...EVENT_FIELDS,
    kind: z.literal('interaction'),
    interaction: AI_HARNESS_INTERACTION,
  }),
  z.object({
    ...EVENT_FIELDS,
    kind: z.literal('state'),
    session: AI_HARNESS_SESSION,
    permission_operation_id: z.uuid().optional(),
    context_update: z.enum(['measured', 'changed', 'restored']).optional(),
    assistant_attempt: z
      .object({
        id: z.string().min(1).max(200),
        state: z.enum(['started', 'committed', 'discarded']),
      })
      .optional(),
  }),
  z.object({ ...EVENT_FIELDS, kind: z.literal('agent'), run: AI_AGENT_RUN }),
  z.object({
    ...EVENT_FIELDS,
    kind: z.literal('usage'),
    usage: AI_AGENT_USAGE,
    context_percent: z.number().min(0).max(100).nullable(),
  }),
  z.object({
    ...EVENT_FIELDS,
    kind: z.literal('completed'),
    input_discarded: z.boolean().optional(),
    interrupted: z.boolean(),
    durable_seq: z.int().min(-1),
  }),
  z.object({ ...EVENT_FIELDS, kind: z.literal('failed'), failure: AI_HARNESS_FAILURE }),
]);
export type AiHarnessEvent = z.infer<typeof AI_HARNESS_EVENT>;
export const AI_HARNESS_NOTICE = z.object({
  type: z.literal('ai_harness'),
  event: AI_HARNESS_EVENT,
});
export type AiHarnessNotice = z.infer<typeof AI_HARNESS_NOTICE>;
