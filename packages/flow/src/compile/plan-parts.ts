import { ERROR_CLASS, JSON_VALUE, PORT_VALUE, SIGNAL_MATCHER } from '@smarteverything/domain';
import { z } from 'zod';

export const TEXT = z.string().min(1);
export const MILLISECONDS = z.int().min(1);

export const AT = z.strictObject({ id: TEXT, key: TEXT });

export type At = z.infer<typeof AT>;

export const PLAN_PORTS = z.record(TEXT, PORT_VALUE);

export type PlanPorts = z.infer<typeof PLAN_PORTS>;

export const RETRY_CLASS = z.enum(['idempotent', 'relative', 'external']);

export const BUDGET_CLASS = z.enum([
  'none',
  'command',
  'effects',
  'effects_person',
  'effects_if_durable',
]);

export const CATCH_CLASSES = z.array(ERROR_CLASS).min(1);

export const LOOP_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('items'),
    items: PORT_VALUE,
    concurrency: z.int().min(1),
    reverse: z.boolean(),
    collect: PORT_VALUE.optional(),
  }),
  z.strictObject({ kind: z.literal('count'), times: PORT_VALUE }),
  z.strictObject({
    kind: z.literal('range'),
    from: PORT_VALUE,
    to: PORT_VALUE,
    step: PORT_VALUE,
  }),
  z.strictObject({ kind: z.literal('open') }),
]);

export type LoopSource = z.infer<typeof LOOP_SOURCE>;

export const LOOP_TEST = z.strictObject({ when: PORT_VALUE, stopWhen: z.boolean() });

export type LoopTest = z.infer<typeof LOOP_TEST>;

export const LOOP_GAP = z.strictObject({
  ms: MILLISECONDS,
  skipAfterLast: z.boolean(),
  clipToDeadline: z.boolean(),
});

export type LoopGap = z.infer<typeof LOOP_GAP>;

export const WAIT_SPEC = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('duration'),
    duration: PORT_VALUE,
    ifLate: z.enum(['run', 'skip', 'fail']),
  }),
  z.strictObject({
    kind: z.literal('until_instant'),
    at: PORT_VALUE.optional(),
    clock: JSON_VALUE.optional(),
    ifLate: z.enum(['skip', 'run']),
    graceMs: z.int().min(0),
  }),
  z.strictObject({
    kind: z.literal('event'),
    matcher: SIGNAL_MATCHER,
    timeoutMs: MILLISECONDS.optional(),
  }),
  z.strictObject({
    kind: z.literal('condition'),
    condition: PORT_VALUE,
    holdMs: MILLISECONDS.optional(),
    timeoutMs: MILLISECONDS.optional(),
  }),
  z.strictObject({
    kind: z.literal('answer'),
    person: PORT_VALUE,
    question: PORT_VALUE,
    options: z.array(TEXT).min(2).max(4),
    timeoutMs: MILLISECONDS.optional(),
    defaultAnswer: TEXT.optional(),
  }),
]);

export type WaitSpec = z.infer<typeof WAIT_SPEC>;

export const VAR_SOURCE = z.enum(['run', 'automation', 'home']);

export const VAR_CHANGE = z.strictObject({
  op: TEXT,
  amount: PORT_VALUE.optional(),
  field: TEXT.optional(),
  edge: z.enum(['wrap', 'clamp']),
  steps: z.array(JSON_VALUE).optional(),
});

export type VarChange = z.infer<typeof VAR_CHANGE>;
