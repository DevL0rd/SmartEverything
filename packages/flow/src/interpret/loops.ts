import { JSON_VALUE } from '@smarteverything/domain';
import type { FlowError, JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { LoopSource } from '../compile/plan-parts';
import { iterationBreach } from '../state/budgets';
import { breachError } from '../state/errors';
import type { Completion, Frame, LoopState } from '../state/run-state';
import type { Checked, Env, FrameHandlers, OpHandlers, OpOf, StepResult } from './frames';
import {
  InterpreterError,
  absorb,
  advance,
  boolean,
  complete,
  deriveEnv,
  mismatch,
  newFrame,
  next,
  popFrame,
  present,
  propagate,
  pushFrame,
  raise,
  result,
  setOutputs,
  siteOf,
  stay,
  traceNode,
  unsupported,
  withTop,
} from './frames';
import {
  DEFAULT_LIMIT_NOTE,
  deadlineFor,
  LOOP_ADMIT,
  gapFor,
  gapWait,
  iterationsHit,
  limitError,
  timeHit,
  withoutLimitCancel,
} from './loops-limits';
import type { Hit } from './loops-limits';
import { evaluate } from './step';

type Op = OpOf['loop'];

type Locals = Frame['locals'];

type ItemsSource = Extract<LoopSource, { kind: 'items' }>;

type Admission =
  { readonly kind: 'go' } | { readonly kind: 'done' } | { readonly kind: 'hit'; readonly hit: Hit };

interface Prepared {
  readonly count: number | null;
  readonly items?: readonly JsonValue[];
  readonly locals: Locals;
}

const JSON_LIST = z.array(JSON_VALUE);

const BODY = 'body';
const RANGE_TOLERANCE = 1e-9;

function ok<T>(value: T): Checked<T> {
  return { ok: true, value };
}

function loopOf(frame: Frame): LoopState {
  if (frame.loop === undefined) throw new InterpreterError('a loop frame', 'loop state', 'none');
  return frame.loop;
}

function parentOf(env: Env): { readonly op: Op; readonly path: string } {
  const parent = deriveEnv(env, popFrame(env.state));
  const { op } = parent;
  if (op?.op !== 'loop') {
    throw new InterpreterError('a loop frame', 'a loop operation below it', op?.op ?? 'none');
  }
  return { op, path: parent.path };
}

function numberOf(evaluated: ReturnType<typeof evaluate>, label: string): Checked<number> {
  if (!evaluated.ok) return evaluated;
  const { value } = evaluated;
  return typeof value === 'number' ? ok(value) : mismatch(label, 'a number', value);
}

function itemsSource(env: Env, source: ItemsSource): Checked<Prepared> {
  const list = evaluate(env, source.items);
  if (!list.ok) return list;
  const parsed = JSON_LIST.safeParse(list.value);
  if (!parsed.success) return mismatch('the list', 'a list', list.value);
  const items = source.reverse ? [...parsed.data].reverse() : parsed.data;
  const locals = source.collect === undefined ? {} : { results: [] };
  return ok({ count: items.length, items, locals });
}

function countSource(env: Env, source: Extract<LoopSource, { kind: 'count' }>): Checked<Prepared> {
  const times = evaluate(env, source.times);
  if (!times.ok) return times;
  const { value } = times;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return mismatch('the repeat count', 'a whole number of at least 0', value);
  }
  return ok({ count: value, locals: {} });
}

function rangeSource(env: Env, source: Extract<LoopSource, { kind: 'range' }>): Checked<Prepared> {
  const from = numberOf(evaluate(env, source.from), 'the start of the range');
  if (!from.ok) return from;
  const to = numberOf(evaluate(env, source.to), 'the end of the range');
  if (!to.ok) return to;
  const step = numberOf(evaluate(env, source.step), 'the step of the range');
  if (!step.ok) return step;
  if (step.value === 0) {
    return { ok: false, class: 'Invalid', message: 'the step of the range must not be 0' };
  }
  const size = Math.abs(step.value);
  const count = Math.floor(Math.abs(to.value - from.value) / size + RANGE_TOLERANCE) + 1;
  const signed = to.value >= from.value ? size : -size;
  return ok({ count, locals: { from: from.value, step: signed } });
}

function prepare(env: Env, source: LoopSource): Checked<Prepared> {
  switch (source.kind) {
    case 'items':
      return itemsSource(env, source);
    case 'count':
      return countSource(env, source);
    case 'range':
      return rangeSource(env, source);
    case 'open':
      return ok({ count: null, locals: {} });
  }
}

function startLoop(env: Env, op: Op): StepResult {
  if (op.source.kind === 'items' && op.source.concurrency > 1) {
    return unsupported(env, 'a for each with a concurrency above 1');
  }
  const prepared = prepare(env, op.source);
  if (!prepared.ok) return raise(env, prepared);
  const { count, items, locals } = prepared.value;
  const breach = op.source.kind === 'items' ? null : startBreach(env, count);
  if (breach !== null) return breach;
  const deadlineAt = deadlineFor(op.limit, env.now);
  const loop: LoopState = {
    index: 0,
    count,
    startedAt: env.now,
    ...(items === undefined ? {} : { items: [...items] }),
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
  };
  const frame = newFrame(env.state, 'loop', env.path, { ...locals, phase: LOOP_ADMIT });
  return stay(env, pushFrame(env.state, { ...frame, loop }));
}

function traceLoop(
  env: Env,
  status: 'succeeded' | 'failed' | 'cancelled',
  error?: FlowError,
): void {
  const owner = env.frame.kind === 'loop' ? deriveEnv(env, popFrame(env.state)) : env;
  traceNode(owner, status, error);
}

function startBreach(env: Env, count: number | null): StepResult | null {
  const breach = count === null ? null : iterationBreach(count, env.ctx.limits.loopIterations);
  if (breach === null) return null;
  const error = breachError(breach, siteOf(env), env.state.runId);
  traceLoop(env, 'failed', error);
  return complete(env, env.state, { kind: 'error', error });
}

function admissionTested(op: Op, index: number): boolean {
  if (op.test === undefined) return false;
  return index === 0 ? op.entryTest : op.order === 'gap_then_test';
}

function stopped(env: Env, op: Op, label: string): Checked<boolean> {
  if (op.test === undefined) return ok(false);
  const holds = boolean(evaluate(env, op.test.when), label);
  return holds.ok ? ok(holds.value === op.test.stopWhen) : holds;
}

function admission(env: Env, op: Op, loop: LoopState): Checked<Admission> {
  const late = timeHit(op.limit, loop, env.now);
  if (late !== null) return ok({ kind: 'hit', hit: late });
  if (loop.count !== null && loop.index >= loop.count) return ok({ kind: 'done' });
  const halt = admissionTested(op, loop.index)
    ? stopped(env, op, `the condition of ${op.at.key}`)
    : ok(false);
  if (!halt.ok) return halt;
  if (halt.value) return ok({ kind: 'done' });
  const reached = iterationsHit(op.limit, loop);
  return ok(reached === null ? { kind: 'go' } : { kind: 'hit', hit: reached });
}

function counted(loop: LoopState): number {
  if (loop.count === null) throw new InterpreterError('a counted loop', 'loop state', 'no count');
  return loop.count;
}

function sourceFields(op: Op, loop: LoopState, locals: Locals): Record<string, JsonValue> {
  const { index } = loop;
  const { source } = op;
  if (source.kind === 'items') {
    const item = loop.items?.[index];
    if (item === undefined)
      throw new InterpreterError('the item of the pass', 'loop state', 'none');
    return { first: index === 0, last: index === counted(loop) - 1, item };
  }
  if (source.kind === 'count') {
    return { first: index === 0, last: index === counted(loop) - 1 };
  }
  if (source.kind === 'range') {
    const from = locals['from'];
    const step = locals['step'];
    if (typeof from !== 'number' || typeof step !== 'number') {
      throw new InterpreterError('a range with numbers', 'loop state', 'no bounds');
    }
    return { value: from + step * index };
  }
  return {};
}

function scopeOutputs(op: Op, loop: LoopState, locals: Locals): Record<string, JsonValue> {
  const count = loop.count === null ? {} : { count: loop.count };
  return {
    index: loop.index,
    position: loop.index + 1,
    ...count,
    ...sourceFields(op, loop, locals),
  };
}

function startIteration(env: Env, op: Op, loop: LoopState): StepResult {
  const breach = iterationBreach(loop.index + 1, env.ctx.limits.loopIterations);
  if (breach !== null) {
    const error = breachError(breach, siteOf(env), env.state.runId);
    return complete(env, env.state, { kind: 'error', error });
  }
  const outputs = scopeOutputs(op, loop, env.frame.locals);
  const moved = withTop(advance(absorb(env, env.state)), (frame) => ({
    ...frame,
    path: `${env.path}/body`,
    pc: 0,
    locals: { ...frame.locals, phase: BODY },
    outputs: { ...frame.outputs, [op.at.key]: outputs },
  }));
  return result(env, moved);
}

function admit(env: Env, op: Op): StepResult {
  const loop = loopOf(env.frame);
  const verdict = admission(env, op, loop);
  if (!verdict.ok) return raise(env, verdict);
  switch (verdict.value.kind) {
    case 'go':
      return startIteration(env, op, loop);
    case 'done':
      return finish(env, op);
    case 'hit':
      return limitHit(env, op, env.path, verdict.value.hit);
  }
}

function finish(env: Env, op: Op): StepResult {
  traceLoop(env, 'succeeded');
  const results = env.frame.locals['results'];
  const popped = popFrame(absorb(env, env.state));
  const state = results === undefined ? popped : setOutputs(popped, op.at.key, { results });
  return next(deriveEnv(env, state), state);
}

function limitHit(env: Env, op: Op, path: string, hit: Hit): StepResult {
  const cleared = deriveEnv(env, withoutLimitCancel(env.state));
  if (hit.limit.onLimit === 'fail') {
    const site = { node: op.at.id, path, at: env.now };
    const error = limitError(hit, op.at.key, site);
    traceLoop(cleared, 'failed', error);
    return propagate(cleared, { kind: 'error', error });
  }
  const message = hit.limit.note ?? DEFAULT_LIMIT_NOTE;
  cleared.scratch.records.push({ kind: 'note', node: op.at.key, message });
  return finish(cleared, op);
}

function gather(env: Env, op: Op, appended: boolean): Checked<Frame> {
  const { frame } = env;
  const loop = loopOf(frame);
  const bumped: Frame = { ...frame, loop: { ...loop, index: loop.index + 1 } };
  const collect = op.source.kind === 'items' ? op.source.collect : undefined;
  if (!appended || collect === undefined) return ok(bumped);
  const value = present(evaluate(env, collect), 'the collected value');
  if (!value.ok) return value;
  const kept = JSON_LIST.safeParse(frame.locals['results']);
  if (!kept.success) throw new InterpreterError('the collected results', 'loop locals', 'none');
  const results = [...kept.data, value.value];
  return ok({ ...bumped, locals: { ...bumped.locals, results } });
}

function exhausted(loop: LoopState): boolean {
  return loop.count !== null && loop.index >= loop.count;
}

function pause(env: Env, op: Op, path: string): StepResult {
  const loop = loopOf(env.frame);
  const ms = op.gap === undefined ? 0 : gapFor(op.gap, loop, env.now);
  const rewound = withTop(advance(absorb(env, env.state)), (frame) => ({
    ...frame,
    path,
    pc: 0,
    locals: { ...frame.locals, phase: LOOP_ADMIT },
  }));
  if (ms === 0) return result(env, rewound);
  const wait = gapWait(rewound, path, env.now + ms);
  return result(env, { ...rewound, wait }, { kind: 'park', wait });
}

function afterIteration(env: Env, op: Op, path: string): StepResult {
  const loop = loopOf(env.frame);
  const halt =
    op.order === 'test_then_gap' ? stopped(env, op, `the condition of ${op.at.key}`) : ok(false);
  if (!halt.ok) return raise(env, halt);
  const gapless = op.gap === undefined || op.gap.skipAfterLast;
  if (halt.value || (exhausted(loop) && gapless)) return finish(env, op);
  const reached = admissionTested(op, loop.index) ? null : iterationsHit(op.limit, loop);
  return reached === null ? pause(env, op, path) : limitHit(env, op, path, reached);
}

function endIteration(env: Env, op: Op, path: string, appended: boolean): StepResult {
  const gathered = gather(env, op, appended);
  if (!gathered.ok) return raise(env, gathered);
  const state = withTop(absorb(env, env.state), () => gathered.value);
  return afterIteration(deriveEnv(env, state), op, path);
}

function onCancelled(env: Env, completion: Completion, op: Op, path: string): StepResult {
  const hit =
    completion.kind === 'cancelled' && completion.reason === 'loop_limit'
      ? timeHit(op.limit, loopOf(env.frame), env.now)
      : null;
  if (hit !== null) return limitHit(env, op, path, hit);
  traceLoop(env, 'cancelled');
  return propagate(env, completion);
}

function loopFrame(env: Env, completion: Completion): StepResult {
  const { op, path } = parentOf(env);
  switch (completion.kind) {
    case 'normal':
      return endIteration(env, op, path, true);
    case 'continue':
      return completion.target === op.at.key
        ? endIteration(env, op, path, false)
        : propagate(env, completion);
    case 'break':
      return completion.target === op.at.key ? finish(env, op) : propagate(env, completion);
    case 'cancelled':
      return onCancelled(env, completion, op, path);
    case 'error':
      traceLoop(env, 'failed', completion.error);
      return propagate(env, completion);
    case 'return':
    case 'stop':
      return propagate(env, completion);
  }
}

function enterLoop(env: Env, op: Op): StepResult {
  const waiting = env.frame.kind === 'loop' && env.frame.locals['phase'] === LOOP_ADMIT;
  return waiting ? admit(env, op) : startLoop(env, op);
}

function settleGap(env: Env, op: Op, resolved: Checked<unknown>): StepResult {
  return resolved.ok ? admit(env, op) : raise(env, resolved);
}

export const LOOP_OPS: OpHandlers = {
  loop: { enter: enterLoop, settle: settleGap },
  break: { enter: (env, op) => complete(env, env.state, { kind: 'break', target: op.target }) },
  continue: {
    enter: (env, op) => complete(env, env.state, { kind: 'continue', target: op.target }),
  },
};

export const LOOP_FRAMES: FrameHandlers = { loop: loopFrame };
