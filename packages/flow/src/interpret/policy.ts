import { FLOW_ERROR, JSON_VALUE } from '@smarteverything/domain';
import type { ErrorClass, FlowError, NodePolicy } from '@smarteverything/domain';
import { z } from 'zod';
import { FLOW_ERRORS, isCatchable } from '../state/errors';
import type { RunState, Wait } from '../state/run-state';
import type {
  Env,
  FrameHandler,
  NodeResult,
  OpHandler,
  OpHandlers,
  OpOf,
  Outcome,
  StepResult,
} from './frames';
import {
  completeFrame,
  deriveEnv,
  errorFor,
  next,
  raise,
  setOutputs,
  siteOf,
  stay,
  unsupported,
} from './frames';

export const DURABLE_FROM_MS = 5000;

export const POLICY_PREFIX = '$policy/';

const RECORD = z.strictObject({
  attempt: z.int().min(1),
  phase: z.enum(['running', 'backoff']),
  deadlineAt: z.int().min(0).optional(),
  last: FLOW_ERROR.optional(),
});

type Record = z.infer<typeof RECORD>;

type Retry = NonNullable<NodePolicy['retry']>;

type PolicyOp = OpOf['effect' | 'set_var' | 'wait' | 'state_op'];

const DEFAULT_RETRY_CLASSES = ['Unreachable'] as const;

function unit(seed: number, attempt: number): number {
  let value = (seed + attempt * 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function backoffMs(retry: Retry, attempt: number, seed: number): number {
  const grown = retry.backoff === 'fixed' ? retry.initial : retry.initial * 2 ** (attempt - 1);
  const capped = retry.max === undefined ? grown : Math.min(grown, retry.max);
  const spread = retry.jitter === true ? 0.5 + 0.5 * unit(seed, attempt) : 1;
  return Math.max(1, Math.round(capped * spread));
}

function effectClass(op: PolicyOp): 'idempotent' | 'relative' | 'external' {
  return 'retry' in op ? op.retry : 'external';
}

export function repeatAllowed(op: PolicyOp): boolean {
  const policy = op.policy;
  if (policy?.retry === undefined) return true;
  return effectClass(op) === 'idempotent' || policy.acknowledgeRepeat === true;
}

function keyOf(op: PolicyOp): string {
  return `${POLICY_PREFIX}${op.at.key}`;
}

function recordOf(env: Env, op: PolicyOp): Record | undefined {
  const parsed = RECORD.safeParse(env.frame.outputs[keyOf(op)]);
  return parsed.success ? parsed.data : undefined;
}

function freshRecord(env: Env, policy: NodePolicy | undefined): Record {
  return {
    attempt: 1,
    phase: 'running',
    ...(policy?.timeout === undefined ? {} : { deadlineAt: env.now + policy.timeout }),
  };
}

function withRecord(state: RunState, key: string, record: Record | undefined): RunState {
  const last = state.frames.length - 1;
  return {
    ...state,
    frames: state.frames.map((frame, index) => {
      const { [key]: _old, ...rest } = frame.outputs;
      const kept = record !== undefined && index === last;
      return {
        ...frame,
        outputs: kept ? { ...rest, [key]: JSON_VALUE.parse(record) } : rest,
      };
    }),
  };
}

export function policyDeadline(state: RunState): number | undefined {
  const deadlines = state.frames.flatMap((frame) =>
    Object.entries(frame.outputs)
      .filter(([key]) => key.startsWith(POLICY_PREFIX))
      .flatMap(([, value]) => RECORD.parse(value).deadlineAt ?? []),
  );
  return deadlines.length === 0 ? undefined : Math.min(...deadlines);
}

function retryable(env: Env, retry: Retry, record: Record, error: FlowError): boolean {
  const classes: readonly ErrorClass[] = retry.on ?? DEFAULT_RETRY_CLASSES;
  const expired = record.deadlineAt !== undefined && env.now >= record.deadlineAt;
  return (
    isCatchable(error) &&
    error.class !== 'Unknown' &&
    classes.includes(error.class) &&
    record.attempt < retry.attempts &&
    !expired
  );
}

function giveUp(env: Env, op: PolicyOp, error: FlowError): StepResult {
  const cleared = withRecord(env.state, keyOf(op), undefined);
  if (op.policy?.onError === 'continue' && isCatchable(error)) {
    return next(env, setOutputs(cleared, op.at.key, { error: JSON_VALUE.parse(error) }));
  }
  return completeFrame(deriveEnv(env, cleared), { kind: 'error', error });
}

function park(env: Env, op: PolicyOp, record: Record, wait: Wait): StepResult {
  const waiting = withRecord(env.state, keyOf(op), record);
  return stay(env, { ...waiting, wait }, { kind: 'park', wait });
}

interface Pending {
  readonly op: PolicyOp;
  readonly retry: Retry;
  readonly record: Record;
}

function scheduleRetry(env: Env, { op, retry, record }: Pending, error: FlowError): StepResult {
  const delay = backoffMs(retry, record.attempt, env.state.seed);
  const dueAt = env.now + delay;
  if (record.deadlineAt !== undefined && dueAt > record.deadlineAt) {
    const timeout = FLOW_ERRORS.Timeout(
      `${op.at.key} timed out before attempt ${String(record.attempt + 1)}`,
      { ...siteOf(env), attempt: record.attempt },
      { cause: error },
    );
    return giveUp(env, op, timeout);
  }
  const wait: Wait = {
    kind: 'duration',
    nodePath: env.path,
    durable: delay >= DURABLE_FROM_MS,
    dueAt,
  };
  return park(
    env,
    op,
    { ...record, attempt: record.attempt + 1, phase: 'backoff', last: error },
    wait,
  );
}

function failed(env: Env, op: PolicyOp, record: Record, raw: FlowError): StepResult {
  const error = { ...raw, attempt: record.attempt };
  const retry = op.policy?.retry;
  if (retry !== undefined && retryable(env, retry, record, error)) {
    return scheduleRetry(env, { op, retry, record }, error);
  }
  const caused = record.last !== undefined && error.cause === undefined;
  return giveUp(env, op, caused ? { ...error, cause: record.last } : error);
}

function trapped(env: Env, op: PolicyOp, record: Record): Env {
  const handler: FrameHandler = (failing, completion) => {
    const same = failing.frame.id === env.frame.id && failing.frame.pc === env.frame.pc;
    if (completion.kind === 'error' && same) {
      return failed(
        deriveEnv({ ...failing, ctx: env.ctx }, failing.state),
        op,
        record,
        completion.error,
      );
    }
    return completeFrame(deriveEnv({ ...failing, ctx: env.ctx }, failing.state), completion);
  };
  const frames = { ...env.ctx.frames, [env.frame.kind]: handler };
  return { ...env, ctx: { ...env.ctx, frames } };
}

function tagged(outcome: Outcome, record: Record, op: PolicyOp): Outcome {
  if (outcome.kind !== 'effect' || op.policy?.retry === undefined) return outcome;
  const key = `${outcome.request.key}/a${String(record.attempt)}`;
  return { kind: 'effect', request: { ...outcome.request, key } };
}

function backingOff(state: RunState, key: string, record: Record): boolean {
  const stored = state.frames.at(-1)?.outputs[key];
  const parsed = RECORD.safeParse(stored);
  return parsed.success && parsed.data.attempt !== record.attempt;
}

function recorded(op: PolicyOp, record: Record, out: StepResult): StepResult {
  const { outcome } = out;
  if (outcome.kind === 'continue') {
    return { ...out, state: withRecord(out.state, keyOf(op), undefined) };
  }
  if (outcome.kind !== 'effect' && outcome.kind !== 'park') return out;
  if (outcome.kind === 'park' && backingOff(out.state, keyOf(op), record)) return out;
  const policy = op.policy;
  const needed = policy?.timeout !== undefined || policy?.retry !== undefined;
  const state = needed
    ? withRecord(out.state, keyOf(op), { ...record, phase: 'running' })
    : out.state;
  return { ...out, state, outcome: tagged(outcome, record, op) };
}

function attempt<O extends PolicyOp>(
  env: Env,
  op: O,
  inner: OpHandler<O>,
  record: Record,
): StepResult {
  if (!repeatAllowed(op)) {
    return raise(env, {
      class: 'Invalid',
      message: `${op.at.key} repeats a ${effectClass(op)} effect without acknowledgeRepeat`,
    });
  }
  return recorded(op, record, inner.enter(trapped(env, op, record), op));
}

function settleOf<O extends PolicyOp>(
  env: Env,
  op: O,
  inner: OpHandler<O>,
  result: NodeResult,
): StepResult {
  const record = recordOf(env, op) ?? freshRecord(env, op.policy);
  if (!result.ok) return failed(env, op, record, errorFor(env, result));
  if (record.phase === 'backoff') return attempt(env, op, inner, { ...record, phase: 'running' });
  if (inner.settle === undefined) return unsupported(env, `settling the operation ${op.op}`);
  const settled = inner.settle(trapped(env, op, record), op, result);
  return settled.outcome.kind === 'continue'
    ? { ...settled, state: withRecord(settled.state, keyOf(op), undefined) }
    : settled;
}

function guarded<O extends PolicyOp>(inner: OpHandler<O>): OpHandler<O> {
  return {
    enter: (env, op) =>
      op.policy === undefined
        ? inner.enter(env, op)
        : attempt(env, op, inner, freshRecord(env, op.policy)),
    settle: (env, op, result) =>
      op.policy === undefined
        ? (inner.settle?.(env, op, result) ?? unsupported(env, `settling the operation ${op.op}`))
        : settleOf(env, op, inner, result),
  };
}

export function withPolicy(handlers: OpHandlers): OpHandlers {
  return {
    ...handlers,
    ...(handlers.effect === undefined ? {} : { effect: guarded(handlers.effect) }),
    ...(handlers.set_var === undefined ? {} : { set_var: guarded(handlers.set_var) }),
    ...(handlers.wait === undefined ? {} : { wait: guarded(handlers.wait) }),
    ...(handlers.state_op === undefined ? {} : { state_op: guarded(handlers.state_op) }),
  };
}
