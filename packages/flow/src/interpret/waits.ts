import { signalMatchesMatcher } from '@smarteverything/domain';
import type { JsonValue, PortValue, SignalInput } from '@smarteverything/domain';
import { z } from 'zod';
import type { Index } from '../compile/reads';
import { dependencyKeys, readIndex } from '../compile/reads';
import type { Plan, PlanOp } from '../compile/plan';
import type { WaitSpec } from '../compile/plan-parts';
import type { SingleWait, Wait } from '../state/run-state';
import type { Checked, Env, NodeResult, OpHandlers, OpOf, Outputs, StepResult } from './frames';
import { boolean, completeFrame, mismatch, note, raise, stay } from './frames';
import { evaluate } from './step';
import { resolutionOf, resumeResult } from './wait-resume';
import type { WaitResume } from './wait-resume';
import { pass } from './wait-pass';
import { enterAsk, settleAsk } from './waits-answer';

export interface ZonePort {
  readonly nextOccurrence: (clock: JsonValue, after: number) => Checked<number>;
}

type Spec<K extends WaitSpec['kind']> = Extract<WaitSpec, { kind: K }>;

type Parked<K extends Wait['kind']> = Extract<Wait, { kind: K }>;

interface LateRule {
  readonly ifLate: 'run' | 'skip' | 'fail';
  readonly graceMs: number;
}

const indexes = new WeakMap<Plan, Index>();

function indexOf(plan: Plan): Index {
  const held = indexes.get(plan) ?? readIndex(plan);
  indexes.set(plan, held);
  return held;
}

export { resolutionOf, resumeResult };
export type { WaitResume };

export function eventAccepts(wait: Parked<'event'>, signal: SignalInput): boolean {
  return signalMatchesMatcher(wait.matcher, signal) && Date.parse(signal.at) > wait.parkedAt;
}

function earliest(first: number | undefined, second: number | undefined): number | undefined {
  if (first === undefined || second === undefined) return first ?? second;
  return Math.min(first, second);
}

export function wakeAt(wait: Wait): number | undefined {
  switch (wait.kind) {
    case 'any':
      return wait.waits.map(wakeAt).reduce(earliest, undefined);
    case 'duration':
    case 'until_instant':
      return wait.dueAt;
    case 'event':
    case 'answer':
      return wait.deadlineAt;
    case 'condition':
      return earliest(wait.holdUntil, wait.deadlineAt);
    case 'refill':
    case 'breakpoint':
      return undefined;
  }
}

function reached(deadlineAt: number | undefined, now: number): boolean {
  return deadlineAt !== undefined && deadlineAt <= now;
}

export function wakeResume(
  wait: SingleWait,
  now: number,
  recovered: boolean,
): WaitResume | undefined {
  switch (wait.kind) {
    case 'duration':
    case 'until_instant':
      return { kind: 'due', recovered };
    case 'event':
      return { kind: 'timeout' };
    case 'condition':
      return reached(wait.deadlineAt, now) ? { kind: 'timeout' } : { kind: 'evaluate' };
    case 'answer':
      return reached(wait.deadlineAt, now) ? { kind: 'timeout' } : undefined;
    case 'refill':
    case 'breakpoint':
      return undefined;
  }
}

function invalid(env: Env, message: string): StepResult {
  return raise(env, { class: 'Invalid', message });
}

function park(env: Env, wait: Wait): StepResult {
  return stay(env, { ...env.state, wait }, { kind: 'park', wait });
}

function milliseconds(env: Env, port: PortValue, label: string): Checked<number> {
  const evaluated = evaluate(env, port);
  if (!evaluated.ok) return evaluated;
  const { value } = evaluated;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? { ok: true, value }
    : mismatch(label, 'a whole number of milliseconds', value);
}

const INSTANT_VALUE = z.union([
  z.int().min(0),
  z.iso.datetime({ offset: true }).transform((text) => Date.parse(text)),
]);

function instantOf(env: Env, port: PortValue, label: string): Checked<number> {
  const evaluated = evaluate(env, port);
  if (!evaluated.ok) return evaluated;
  const parsed = INSTANT_VALUE.safeParse(evaluated.value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : mismatch(label, 'a moment in time', evaluated.value);
}

function arrive(
  env: Env,
  op: { at: { key: string } },
  rule: LateRule,
  timing: { readonly dueAt: number; readonly recovered: boolean },
): StepResult {
  const lateBy = Math.max(0, env.now - timing.dueAt);
  if (!timing.recovered || lateBy <= rule.graceMs) return pass(env, op, { late: false });
  switch (rule.ifLate) {
    case 'run':
      return pass(env, op, { late: true, lateByMs: lateBy });
    case 'skip':
      note(env, `skipped ${op.at.key}, it was ${String(lateBy)} ms late`);
      return completeFrame(env, { kind: 'normal' });
    case 'fail':
      return raise(env, {
        class: 'Failed',
        message: `${op.at.key} resumed ${String(lateBy)} ms late`,
      });
  }
}

function enterDuration(env: Env, op: OpOf['wait'], spec: Spec<'duration'>): StepResult {
  const length = milliseconds(env, spec.duration, `the duration of ${op.at.key}`);
  if (!length.ok) return raise(env, length);
  if (length.value === 0) return pass(env, op, { late: false });
  const dueAt = env.now + length.value;
  return park(env, { kind: 'duration', nodePath: env.path, durable: op.durable, dueAt });
}

function dueAtOf(
  env: Env,
  op: OpOf['wait'],
  spec: Spec<'until_instant'>,
  zone: ZonePort,
): Checked<number> {
  if (spec.at !== undefined) return instantOf(env, spec.at, `the moment of ${op.at.key}`);
  if (spec.clock === undefined)
    return mismatch<number>(op.at.key, 'a moment or a time of day', undefined);
  return zone.nextOccurrence(spec.clock, env.now);
}

function enterUntil(
  env: Env,
  op: OpOf['wait'],
  spec: Spec<'until_instant'>,
  zone: ZonePort,
): StepResult {
  const due = dueAtOf(env, op, spec, zone);
  if (!due.ok) return raise(env, due);
  if (due.value > env.now) {
    return park(env, {
      kind: 'until_instant',
      nodePath: env.path,
      durable: op.durable,
      dueAt: due.value,
    });
  }
  return arrive(env, op, spec, { dueAt: due.value, recovered: true });
}

function enterEvent(env: Env, op: OpOf['wait'], spec: Spec<'event'>): StepResult {
  return park(env, {
    kind: 'event',
    nodePath: env.path,
    durable: op.durable,
    matcher: spec.matcher,
    parkedAt: env.now,
    ...(spec.timeoutMs === undefined ? {} : { deadlineAt: env.now + spec.timeoutMs }),
  });
}

function enterCondition(
  env: Env,
  op: OpOf['wait'],
  spec: Spec<'condition'>,
  index: Index,
): StepResult {
  const holds = boolean(evaluate(env, spec.condition), `the condition of ${op.at.key}`);
  if (!holds.ok) return raise(env, holds);
  const hold = spec.holdMs ?? 0;
  if (holds.value && hold === 0) return pass(env, op, { timedOut: false });
  return park(env, {
    kind: 'condition',
    nodePath: env.path,
    durable: op.durable,
    deps: [...dependencyKeys(index, spec.condition)],
    ...(spec.timeoutMs === undefined ? {} : { deadlineAt: env.now + spec.timeoutMs }),
    ...(holds.value ? { holdUntil: env.now + hold } : {}),
  });
}

function enterWait(zone: ZonePort): (env: Env, op: OpOf['wait']) => StepResult {
  return (env, op) => {
    const { wait } = op;
    switch (wait.kind) {
      case 'duration':
        return enterDuration(env, op, wait);
      case 'until_instant':
        return enterUntil(env, op, wait, zone);
      case 'event':
        return enterEvent(env, op, wait);
      case 'condition':
        return enterCondition(env, op, wait, indexOf(env.plan));
      case 'answer':
        return enterAsk(env, op, wait);
    }
  };
}

function ruleOf(spec: PlanOp & { op: 'wait' }): LateRule | undefined {
  const { wait } = spec;
  if (wait.kind === 'duration') return { ifLate: wait.ifLate, graceMs: 0 };
  if (wait.kind === 'until_instant') return { ifLate: wait.ifLate, graceMs: wait.graceMs };
  return undefined;
}

function settleTimer(
  env: Env,
  op: OpOf['wait'],
  wait: Parked<'duration'> | Parked<'until_instant'>,
  resume: WaitResume,
): StepResult {
  const rule = ruleOf(op);
  if (resume.kind !== 'due' || rule === undefined) {
    return invalid(env, `${op.at.key} cannot be resumed by ${resume.kind}`);
  }
  return arrive(env, op, rule, { dueAt: wait.dueAt, recovered: resume.recovered });
}

function signalOutputs(signal: SignalInput): Outputs {
  return {
    timedOut: false,
    value: signal.value,
    data: signal.data,
    at: signal.at,
    ...(signal.subject === null ? {} : { subject: signal.subject }),
    ...(signal.field === null ? {} : { field: signal.field }),
    ...(signal.previous === null ? {} : { previous: signal.previous }),
  };
}

function settleDeadline(env: Env, op: OpOf['wait'], wait: Wait): StepResult {
  if ((wait.kind === 'event' || wait.kind === 'condition') && wait.deadlineAt !== undefined) {
    return pass(env, op, { timedOut: true });
  }
  return invalid(env, `${op.at.key} has no deadline to time out`);
}

function settleEvent(
  env: Env,
  op: OpOf['wait'],
  wait: Parked<'event'>,
  resume: WaitResume,
): StepResult {
  if (resume.kind === 'timeout') return settleDeadline(env, op, wait);
  if (resume.kind === 'signal' && eventAccepts(wait, resume.signal)) {
    return pass(env, op, signalOutputs(resume.signal));
  }
  return invalid(env, `${op.at.key} was resumed by something it is not waiting for`);
}

function withoutHold(wait: Parked<'condition'>): Parked<'condition'> {
  const { holdUntil: _hold, ...rest } = wait;
  return rest;
}

function reevaluate(
  env: Env,
  op: OpOf['wait'],
  spec: Spec<'condition'>,
  wait: Parked<'condition'>,
): StepResult {
  const holds = boolean(evaluate(env, spec.condition), `the condition of ${op.at.key}`);
  if (!holds.ok) return raise(env, holds);
  if (!holds.value) return park(env, withoutHold(wait));
  const hold = spec.holdMs ?? 0;
  if (hold === 0 || (wait.holdUntil !== undefined && env.now >= wait.holdUntil)) {
    return pass(env, op, { timedOut: false });
  }
  return park(env, wait.holdUntil === undefined ? { ...wait, holdUntil: env.now + hold } : wait);
}

function settleCondition(
  env: Env,
  op: OpOf['wait'],
  wait: Parked<'condition'>,
  resume: WaitResume,
): StepResult {
  if (resume.kind === 'timeout') return settleDeadline(env, op, wait);
  if (resume.kind !== 'evaluate' || op.wait.kind !== 'condition') {
    return invalid(env, `${op.at.key} cannot be resumed by ${resume.kind}`);
  }
  return reevaluate(env, op, op.wait, wait);
}

function settleWait(env: Env, op: OpOf['wait'], result: NodeResult): StepResult {
  const resolution = resolutionOf(env, op, result);
  if (!resolution.ok) return raise(env, resolution);
  const { wait, resume } = resolution.value;
  switch (wait.kind) {
    case 'duration':
    case 'until_instant':
      return settleTimer(env, op, wait, resume);
    case 'event':
      return settleEvent(env, op, wait, resume);
    case 'condition':
      return settleCondition(env, op, wait, resume);
    case 'answer':
    case 'refill':
    case 'breakpoint':
    case 'any':
      return invalid(env, `${wait.kind} waits are not resolved by ${op.at.key}`);
  }
}

function settleAny(env: Env, op: OpOf['wait'], result: NodeResult): StepResult {
  return op.wait.kind === 'answer'
    ? settleAsk(env, op, op.wait, result)
    : settleWait(env, op, result);
}

export function waitOps(zone: ZonePort): OpHandlers {
  return { wait: { enter: enterWait(zone), settle: settleAny } };
}
