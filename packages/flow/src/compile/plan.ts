import {
  ERROR_CLASS,
  LOOP_LIMIT,
  NODE_POLICY,
  PORT_VALUE,
  STRUCTURED_OUTPUT,
  SWITCH_MATCH,
  VARIABLE,
} from '@smarteverything/domain';
import type {
  ErrorClass,
  LoopLimit,
  NodePolicy,
  PortValue,
  StructuredOutput,
  SwitchMatch,
  Variable,
} from '@smarteverything/domain';
import { z } from 'zod';
import type {
  At,
  LoopGap,
  LoopSource,
  LoopTest,
  PlanPorts,
  VarChange,
  WaitSpec,
} from './plan-parts';
import {
  AT,
  BUDGET_CLASS,
  CATCH_CLASSES,
  LOOP_GAP,
  LOOP_SOURCE,
  LOOP_TEST,
  PLAN_PORTS,
  RETRY_CLASS,
  TEXT,
  VAR_CHANGE,
  VAR_SOURCE,
  WAIT_SPEC,
} from './plan-parts';

export interface Exec {
  at: At;
  policy?: NodePolicy | undefined;
}

export interface SeqOp {
  op: 'seq';
  ops: PlanOp[];
}

export interface BranchRow {
  id: string;
  when: PortValue;
  then: PlanOp;
}

export interface BranchOp {
  op: 'branch';
  at: At;
  rows: BranchRow[];
  else?: PlanOp | undefined;
  outputs?: StructuredOutput[] | undefined;
}

export interface SwitchRow {
  id: string;
  match: SwitchMatch;
  then: PlanOp;
}

export interface SwitchOp {
  op: 'switch';
  at: At;
  subject: PortValue;
  mode: 'first' | 'all';
  cases: SwitchRow[];
  default?: PlanOp | undefined;
  outputs?: StructuredOutput[] | undefined;
}

export interface GuardOp {
  op: 'guard';
  at: At;
  condition: PortValue;
  quietly: boolean;
}

export interface LoopOp {
  op: 'loop';
  at: At;
  source: LoopSource;
  test?: LoopTest | undefined;
  entryTest: boolean;
  order: 'gap_then_test' | 'test_then_gap';
  gap?: LoopGap | undefined;
  limit?: LoopLimit | undefined;
  body: PlanOp;
}

export interface BreakOp {
  op: 'break';
  at: At;
  target: string;
}

export interface ContinueOp {
  op: 'continue';
  at: At;
  target: string;
}

export interface ParallelBranch {
  name: string;
  body: PlanOp;
}

export interface ParallelOp {
  op: 'parallel';
  at: At;
  join: 'all' | 'first' | 'settled';
  errors: 'failFast' | 'settle';
  branches: ParallelBranch[];
  outputs?: StructuredOutput[] | undefined;
}

export interface CatchRow {
  id: string;
  classes?: ErrorClass[] | undefined;
  then: PlanOp;
}

export interface TryOp {
  op: 'try';
  at: At;
  body: PlanOp;
  catches: CatchRow[];
  finally?: PlanOp | undefined;
  outputs?: StructuredOutput[] | undefined;
}

export interface CallOp extends Exec {
  op: 'call';
  fn: string;
  pin?: number | undefined;
  inputs: PlanPorts;
  detached: false;
}

export interface RunOp extends Exec {
  op: 'run';
  automation: string;
  wait: boolean;
  allowSelf: boolean;
  inputs: PlanPorts;
  detached: true;
}

export interface WaitOp extends Exec {
  op: 'wait';
  durable: boolean;
  wait: WaitSpec;
  scopes?: Record<string, PlanOp> | undefined;
}

export interface EffectOp extends Exec {
  op: 'effect';
  kind: string;
  params: PlanPorts;
  retry: z.infer<typeof RETRY_CLASS>;
  budget: z.infer<typeof BUDGET_CLASS>;
}

export interface WithEffectOp extends Exec {
  op: 'with_effect';
  kind: string;
  params: PlanPorts;
  retry: z.infer<typeof RETRY_CLASS>;
  budget: z.infer<typeof BUDGET_CLASS>;
  body: PlanOp;
}

export interface ComputeOp {
  op: 'compute';
  at: At;
  kind: string;
  ports: PlanPorts;
}

export interface ReadOp extends Exec {
  op: 'read';
  kind: string;
  ports: PlanPorts;
  reads: string[];
}

export interface SetVarOp extends Exec {
  op: 'set_var';
  mode: 'set' | 'change';
  source: z.infer<typeof VAR_SOURCE>;
  name?: string | undefined;
  value?: string | undefined;
  to?: PortValue | undefined;
  change?: VarChange | undefined;
  retry: z.infer<typeof RETRY_CLASS>;
  budget: z.infer<typeof BUDGET_CLASS>;
}

export interface StateOp extends Exec {
  op: 'state_op';
  kind: string;
  ports: PlanPorts;
  exits: string[];
  scopes?: Record<string, PlanOp> | undefined;
}

export interface ReturnOp {
  op: 'return';
  at: At;
  exit?: string | undefined;
  values: PlanPorts;
}

export interface StopOp {
  op: 'stop';
  at: At;
  message?: PortValue | undefined;
  failed: boolean;
  cancelSelf: boolean;
}

export interface FailOp {
  op: 'fail';
  at: At;
  class: ErrorClass;
  message?: PortValue | undefined;
  cause?: PortValue | undefined;
}

export interface BreakpointOp {
  op: 'breakpoint';
  at: At;
}

export type PlanOp =
  | SeqOp
  | BranchOp
  | SwitchOp
  | GuardOp
  | LoopOp
  | BreakOp
  | ContinueOp
  | ParallelOp
  | TryOp
  | CallOp
  | RunOp
  | WaitOp
  | EffectOp
  | WithEffectOp
  | ComputeOp
  | ReadOp
  | SetVarOp
  | StateOp
  | ReturnOp
  | StopOp
  | FailOp
  | BreakpointOp;

const OP: z.ZodType<PlanOp> = z.lazy(() => PLAN_OP);

const EXEC = { at: AT, policy: NODE_POLICY.optional() };

const OUTPUTS = z.array(STRUCTURED_OUTPUT).optional();

const EFFECT_CLASSES = { retry: RETRY_CLASS, budget: BUDGET_CLASS };

const PLAN_OP: z.ZodType<PlanOp> = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('seq'), ops: z.array(OP) }),
  z.strictObject({
    op: z.literal('branch'),
    at: AT,
    rows: z.array(z.strictObject({ id: TEXT, when: PORT_VALUE, then: OP })).min(1),
    else: OP.optional(),
    outputs: OUTPUTS,
  }),
  z.strictObject({
    op: z.literal('switch'),
    at: AT,
    subject: PORT_VALUE,
    mode: z.enum(['first', 'all']),
    cases: z.array(z.strictObject({ id: TEXT, match: SWITCH_MATCH, then: OP })),
    default: OP.optional(),
    outputs: OUTPUTS,
  }),
  z.strictObject({
    op: z.literal('guard'),
    at: AT,
    condition: PORT_VALUE,
    quietly: z.boolean(),
  }),
  z.strictObject({
    op: z.literal('loop'),
    at: AT,
    source: LOOP_SOURCE,
    test: LOOP_TEST.optional(),
    entryTest: z.boolean(),
    order: z.enum(['gap_then_test', 'test_then_gap']),
    gap: LOOP_GAP.optional(),
    limit: LOOP_LIMIT.optional(),
    body: OP,
  }),
  z.strictObject({ op: z.literal('break'), at: AT, target: TEXT }),
  z.strictObject({ op: z.literal('continue'), at: AT, target: TEXT }),
  z.strictObject({
    op: z.literal('parallel'),
    at: AT,
    join: z.enum(['all', 'first', 'settled']),
    errors: z.enum(['failFast', 'settle']),
    branches: z.array(z.strictObject({ name: TEXT, body: OP })).min(2),
    outputs: OUTPUTS,
  }),
  z.strictObject({
    op: z.literal('try'),
    at: AT,
    body: OP,
    catches: z.array(z.strictObject({ id: TEXT, classes: CATCH_CLASSES.optional(), then: OP })),
    finally: OP.optional(),
    outputs: OUTPUTS,
  }),
  z.strictObject({
    op: z.literal('call'),
    ...EXEC,
    fn: TEXT,
    pin: z.int().min(1).optional(),
    inputs: PLAN_PORTS,
    detached: z.literal(false),
  }),
  z.strictObject({
    op: z.literal('run'),
    ...EXEC,
    automation: TEXT,
    wait: z.boolean(),
    allowSelf: z.boolean(),
    inputs: PLAN_PORTS,
    detached: z.literal(true),
  }),
  z.strictObject({
    op: z.literal('wait'),
    ...EXEC,
    durable: z.boolean(),
    wait: WAIT_SPEC,
    scopes: z.record(TEXT, OP).optional(),
  }),
  z.strictObject({
    op: z.literal('effect'),
    ...EXEC,
    kind: TEXT,
    params: PLAN_PORTS,
    ...EFFECT_CLASSES,
  }),
  z.strictObject({
    op: z.literal('with_effect'),
    ...EXEC,
    kind: TEXT,
    params: PLAN_PORTS,
    ...EFFECT_CLASSES,
    body: OP,
  }),
  z.strictObject({ op: z.literal('compute'), at: AT, kind: TEXT, ports: PLAN_PORTS }),
  z.strictObject({
    op: z.literal('read'),
    ...EXEC,
    kind: TEXT,
    ports: PLAN_PORTS,
    reads: z.array(TEXT),
  }),
  z.strictObject({
    op: z.literal('set_var'),
    ...EXEC,
    mode: z.enum(['set', 'change']),
    source: VAR_SOURCE,
    name: TEXT.optional(),
    value: TEXT.optional(),
    to: PORT_VALUE.optional(),
    change: VAR_CHANGE.optional(),
    ...EFFECT_CLASSES,
  }),
  z.strictObject({
    op: z.literal('state_op'),
    ...EXEC,
    kind: TEXT,
    ports: PLAN_PORTS,
    exits: z.array(TEXT),
    scopes: z.record(TEXT, OP).optional(),
  }),
  z.strictObject({ op: z.literal('return'), at: AT, exit: TEXT.optional(), values: PLAN_PORTS }),
  z.strictObject({
    op: z.literal('stop'),
    at: AT,
    message: PORT_VALUE.optional(),
    failed: z.boolean(),
    cancelSelf: z.boolean(),
  }),
  z.strictObject({
    op: z.literal('fail'),
    at: AT,
    class: ERROR_CLASS,
    message: PORT_VALUE.optional(),
    cause: PORT_VALUE.optional(),
  }),
  z.strictObject({ op: z.literal('breakpoint'), at: AT }),
]);

export { PLAN_OP };

export const PLAN = z.strictObject({
  version: z.literal(1),
  subject: z.enum(['automation', 'function']),
  exits: z.array(TEXT),
  variables: z.array(VARIABLE),
  body: PLAN_OP,
  onFailure: PLAN_OP.optional(),
});

export interface Plan {
  version: 1;
  subject: 'automation' | 'function';
  exits: string[];
  variables: Variable[];
  body: PlanOp;
  onFailure?: PlanOp | undefined;
}
