import {
  FLOW_ERROR,
  JSON_VALUE,
  PLUGIN_ORIGIN,
  SIGNAL_INPUT,
  SIGNAL_MATCHER,
} from '@smarteverything/domain';
import { z } from 'zod';
import { RUN_BUDGETS } from './budgets';

const TEXT = z.string().min(1);

const INSTANT = z.int().min(0);

const JSON_RECORD = z.record(z.string(), JSON_VALUE);

export const CANCEL_REASONS = [
  'user_stop',
  'restart_mode',
  'disabled',
  'removed',
  'parent_cancelled',
  'budget',
  'timeout',
  'shutdown',
  'feedback_guard',
  'loop_limit',
] as const;

export const CANCEL_REASON = z.enum(CANCEL_REASONS);

export type CancelReason = z.infer<typeof CANCEL_REASON>;

export const FRAME_KINDS = [
  'root',
  'call',
  'loop',
  'branch',
  'parallel',
  'try',
  'with_effect',
] as const;

export const FRAME_KIND = z.enum(FRAME_KINDS);

export const COMPLETION = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('normal') }),
  z.strictObject({ kind: z.literal('error'), error: FLOW_ERROR }),
  z.strictObject({ kind: z.literal('break'), target: TEXT }),
  z.strictObject({ kind: z.literal('continue'), target: TEXT }),
  z.strictObject({ kind: z.literal('return'), exit: TEXT.optional() }),
  z.strictObject({ kind: z.literal('stop'), failed: z.boolean() }),
  z.strictObject({ kind: z.literal('cancelled'), reason: CANCEL_REASON }),
]);

export type Completion = z.infer<typeof COMPLETION>;

export const TRY_STATE = z.strictObject({
  phase: z.enum(['body', 'catch', 'finally']),
  row: TEXT.optional(),
  completion: COMPLETION,
});

export type TryState = z.infer<typeof TRY_STATE>;

export const LOOP_STATE = z
  .strictObject({
    index: z.int().min(0),
    count: z.int().min(0).nullable(),
    items: z.array(JSON_VALUE).optional(),
    itemsRef: TEXT.optional(),
    startedAt: INSTANT,
    deadlineAt: INSTANT.optional(),
  })
  .refine((loop) => loop.items === undefined || loop.itemsRef === undefined, {
    message: 'a loop keeps its items or a reference to them, not both',
    path: ['itemsRef'],
  });

export type LoopState = z.infer<typeof LOOP_STATE>;

export const FRAME = z.strictObject({
  id: TEXT,
  kind: FRAME_KIND,
  path: TEXT,
  pc: z.int().min(0),
  locals: JSON_RECORD,
  outputs: JSON_RECORD,
  loop: LOOP_STATE.optional(),
  children: z.array(TEXT).optional(),
  tryState: TRY_STATE.optional(),
  joinedOutputs: JSON_RECORD.optional(),
});

export type Frame = z.infer<typeof FRAME>;

const WAIT_BASE = { nodePath: TEXT, durable: z.boolean(), late: z.boolean().optional() };

const SINGLE_WAITS = [
  z.strictObject({ kind: z.literal('duration'), ...WAIT_BASE, dueAt: INSTANT }),
  z.strictObject({ kind: z.literal('until_instant'), ...WAIT_BASE, dueAt: INSTANT }),
  z.strictObject({
    kind: z.literal('condition'),
    ...WAIT_BASE,
    deps: z.array(TEXT),
    deadlineAt: INSTANT.optional(),
    holdUntil: INSTANT.optional(),
  }),
  z.strictObject({
    kind: z.literal('event'),
    ...WAIT_BASE,
    matcher: SIGNAL_MATCHER,
    parkedAt: INSTANT,
    deadlineAt: INSTANT.optional(),
  }),
  z.strictObject({
    kind: z.literal('answer'),
    ...WAIT_BASE,
    notificationId: TEXT,
    options: z.array(TEXT),
    deadlineAt: INSTANT.optional(),
  }),
  z.strictObject({
    kind: z.literal('refill'),
    ...WAIT_BASE,
    target: z.enum(['command', 'effects']),
    dueAt: INSTANT,
    askedAt: INSTANT,
  }),
  z.strictObject({ kind: z.literal('breakpoint'), ...WAIT_BASE }),
] as const;

const SINGLE_WAIT = z.discriminatedUnion('kind', SINGLE_WAITS);

export const WAIT = z.discriminatedUnion('kind', [
  ...SINGLE_WAITS,
  z.strictObject({ kind: z.literal('any'), ...WAIT_BASE, waits: z.array(SINGLE_WAIT).min(1) }),
]);

export type SingleWait = z.infer<typeof SINGLE_WAIT>;
export type Wait = z.infer<typeof WAIT>;

export const PLAN_REF = z.strictObject({
  id: TEXT,
  revision: z.int().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type PlanRef = z.infer<typeof PLAN_REF>;

export const CAUSE_LINK = z.strictObject({ automationId: TEXT, runId: TEXT });

export const RUN_STATE = z.strictObject({
  runId: z.uuid(),
  automationId: z.uuid(),
  revision: z.int().min(1),
  planRefs: z.array(PLAN_REF).min(1),
  trigger: SIGNAL_INPUT.nullable(),
  payload: JSON_RECORD,
  inputs: JSON_RECORD,
  ownerProfileId: z.uuid().nullable(),
  origin: PLUGIN_ORIGIN.nullable(),
  causeChain: z.array(CAUSE_LINK),
  frames: z.array(FRAME).min(1),
  captures: JSON_RECORD,
  budgets: RUN_BUDGETS,
  wait: WAIT.optional(),
  cancel: z.strictObject({ reason: CANCEL_REASON, requestedAt: INSTANT }).optional(),
  seed: z.int().min(0),
});

export type RunState = z.infer<typeof RUN_STATE>;

export function serialiseRunState(state: RunState): string {
  return JSON.stringify(RUN_STATE.parse(state));
}

export function restoreRunState(text: string): RunState {
  return RUN_STATE.parse(JSON.parse(text));
}
