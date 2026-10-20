import { JSON_VALUE, jsonEquals } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { parallelBreach } from '../state/budgets';
import { FLOW_ERRORS, breachError } from '../state/errors';
import { COMPLETION, WAIT } from '../state/run-state';
import type {
  CancelReason,
  Completion,
  Frame,
  RunState,
  SingleWait,
  Wait,
} from '../state/run-state';
import type {
  Env,
  FrameHandlers,
  NodeResult,
  OpHandlers,
  OpOf,
  Outcome,
  StepEvent,
  StepResult,
} from './frames';
import {
  InterpreterError,
  absorb,
  asRecord,
  complete,
  deriveEnv,
  newFrame,
  next,
  popFrame,
  propagate,
  pushFrame,
  runVars,
  setOutputs,
  siteOf,
  stay,
  unsupported,
  withTop,
} from './frames';
import { LANES, VERDICT, judgeParallel, statusList, terminal } from './join';
import type { Lane, Verdict } from './join';
import { step } from './step';

export const COLLECT_KEY = '$collect';

const LANES_KEY = '$lanes';
const ACTIVE_KEY = '$active';
const LANDED_KEY = '$landed';
const VERDICT_KEY = '$verdict';
const PRESENTED_KEY = '$presented';

export interface Region {
  readonly tidy: (frame: Frame) => Frame;
  readonly fill: (env: Env, frame: Frame) => Frame;
  readonly judge: (frame: Frame, lanes: readonly Lane[]) => Verdict | undefined;
  readonly finish: (env: Env, frame: Frame, winners: readonly number[]) => StepResult;
}

export function lanesOf(frame: Frame): readonly Lane[] {
  return LANES.parse(frame.outputs[LANES_KEY] ?? []);
}

export function withOutputs(frame: Frame, entries: Readonly<Record<string, JsonValue>>): Frame {
  return { ...frame, outputs: { ...frame.outputs, ...entries } };
}

export function withLanes(frame: Frame, lanes: readonly Lane[]): Frame {
  const children = lanes.flatMap((lane) => lane.frames.slice(0, 1).map((bottom) => bottom.id));
  return { ...withOutputs(frame, { [LANES_KEY]: JSON_VALUE.parse(lanes) }), children };
}

export function verdictOf(frame: Frame): Verdict | undefined {
  const parsed = VERDICT.safeParse(frame.outputs[VERDICT_KEY]);
  return parsed.success ? parsed.data : undefined;
}

export function withVerdict(frame: Frame, verdict: Verdict): Frame {
  return withOutputs(frame, { [VERDICT_KEY]: JSON_VALUE.parse(verdict) });
}

export function newLane(index: number, name: string, bottom: Frame): Lane {
  return {
    index,
    name,
    status: 'ready',
    frames: [bottom],
    cancelRequested: false,
    produced: {},
    seq: 0,
  };
}

function liveWidth(frames: readonly Frame[]): number {
  return frames.reduce((sum, frame) => sum + (frame.kind === 'parallel' ? widthOf(frame) : 0), 0);
}

function widthOf(frame: Frame): number {
  const lanes = lanesOf(frame);
  const inner = lanes.reduce((sum, lane) => sum + liveWidth(lane.frames), 0);
  return lanes.filter((lane) => !terminal(lane)).length + inner;
}

export function widthBreach(env: Env, width: number): StepResult | null {
  const breach = parallelBreach(width, liveWidth(env.state.frames) + width, env.ctx.limits);
  if (breach === null) return null;
  const error = breachError(breach, siteOf(env), env.state.runId);
  return complete(env, env.state, { kind: 'error', error });
}

function entryFor(env: Env, lane: Lane): Frame {
  const hollow = lanesOf(env.frame).map((held) =>
    held.index === lane.index ? { ...held, frames: [] } : held,
  );
  const marked = { [ACTIVE_KEY]: lane.index, [env.at.key]: {} };
  return withOutputs(withLanes(env.frame, hollow), marked);
}

function laneState(env: Env, lane: Lane): RunState {
  const { cancel: _cancel, wait: _wait, ...rest } = env.state;
  return {
    ...rest,
    frames: [...env.state.frames.slice(0, -1), entryFor(env, lane), ...lane.frames],
    ...(lane.cancel === undefined ? {} : { cancel: lane.cancel }),
  };
}

function landingOf(
  frame: Frame,
  tail: readonly Frame[],
  outcome: Outcome,
): Completion | 'normal' | undefined {
  const marked = frame.outputs[LANDED_KEY];
  if (marked !== undefined) return COMPLETION.parse(marked);
  if (outcome.kind === 'failed') return { kind: 'error', error: outcome.error };
  return tail.length === 0 ? 'normal' : undefined;
}

function running(lane: Lane, outcome: Outcome): Lane {
  if (outcome.kind === 'park') return { ...lane, status: 'waiting', wait: outcome.wait };
  return { ...lane, status: outcome.kind === 'effect' ? 'effecting' : 'ready' };
}

interface Landed {
  readonly head: readonly Frame[];
  readonly tail: readonly Frame[];
  readonly after: Frame;
  readonly seq: number;
}

function updated(env: Env, lane: Lane, stepped: StepResult, landed: Landed): Lane {
  const { wait: _wait, cancel: _cancel, ...rest } = lane;
  const landing = landingOf(landed.after, landed.tail, stepped.outcome);
  if (landing === 'normal') {
    const collected = landed.after.outputs[COLLECT_KEY];
    return {
      ...rest,
      status: 'done',
      frames: [],
      produced: asRecord(landed.after.outputs[env.at.key]),
      ...(collected === undefined ? {} : { collected }),
      seq: landed.seq,
    };
  }
  if (landing !== undefined) {
    return { ...rest, status: 'ended', frames: [], completion: landing, seq: landed.seq };
  }
  const { cancel } = stepped.state;
  const live = { ...rest, frames: [...landed.tail], ...(cancel === undefined ? {} : { cancel }) };
  return running(live, stepped.outcome);
}

function cleaned(env: Env, after: Frame, lanes: readonly Lane[], presented?: number): Frame {
  const key = env.at.key;
  const {
    [ACTIVE_KEY]: _active,
    [LANDED_KEY]: _landed,
    [COLLECT_KEY]: _collect,
    [PRESENTED_KEY]: _presented,
    [key]: _produced,
    ...kept
  } = after.outputs;
  const held = env.frame.outputs[key];
  const outputs = held === undefined ? kept : { ...kept, [key]: held };
  const frame = withLanes({ ...after, pc: 0, outputs }, lanes);
  return presented === undefined ? frame : withOutputs(frame, { [PRESENTED_KEY]: presented });
}

function violation(env: Env, lane: Lane): Verdict {
  const message = `${lane.name} wrote a run variable, parallel branches may only read them`;
  const error = FLOW_ERRORS.Invalid(message, siteOf(env));
  return { kind: 'completion', completion: { kind: 'error', error } };
}

function land(env: Env, lane: Lane, stepped: StepResult): StepResult {
  const base = env.state.frames.length;
  const head = stepped.state.frames.slice(0, base);
  const after = head.at(-1);
  if (after === undefined) {
    throw new InterpreterError('a parallel region', 'its frame after a branch step', 'none');
  }
  const lanes = lanesOf(env.frame);
  const seq = Math.max(0, ...lanes.map((held) => held.seq)) + 1;
  const tail = stepped.state.frames.slice(base);
  const moved = updated(env, lane, stepped, { head, tail, after, seq });
  const all = lanes.map((held) => (held.index === lane.index ? moved : held));
  const effect = stepped.outcome.kind === 'effect' && moved.status === 'effecting';
  const frame = cleaned(env, after, all, effect ? lane.index : undefined);
  const wrote = !jsonEquals(runVars(env.state), runVars(stepped.state));
  const kept = wrote ? env.state.frames.slice(0, -1) : head.slice(0, -1);
  const judged =
    wrote && verdictOf(frame) === undefined ? withVerdict(frame, violation(env, lane)) : frame;
  const { cancel: _cancel, wait: _wait, ...rest } = stepped.state;
  const held = env.state.cancel === undefined ? {} : { cancel: env.state.cancel };
  env.scratch.records.push(...stepped.records);
  const state: RunState = { ...rest, ...held, frames: [...kept, judged] };
  return stay(env, state, effect ? stepped.outcome : { kind: 'continue' });
}

export function drive(env: Env, index: number, event: StepEvent): StepResult {
  const lane = lanesOf(env.frame).find((held) => held.index === index);
  if (lane === undefined) {
    throw new InterpreterError('a parallel region', `a branch ${String(index)}`, 'none');
  }
  return land(env, lane, step(env.ctx, laneState(env, lane), event));
}

function leavesOf(wait: Wait | undefined): readonly SingleWait[] {
  if (wait === undefined) return [];
  return wait.kind === 'any' ? wait.waits : [wait];
}

function routed(lanes: readonly Lane[], result: NodeResult): Lane | undefined {
  const waiting = lanes.filter((lane) => lane.status === 'waiting');
  const resolved = result.ok ? WAIT.safeParse(asRecord(result.value)['wait']) : undefined;
  if (resolved?.success !== true) return waiting[0];
  const leaf = JSON_VALUE.parse(resolved.data);
  return waiting.find((lane) =>
    leavesOf(lane.wait).some((held) => jsonEquals(JSON_VALUE.parse(held), leaf)),
  );
}

export function settleRegion(env: Env, result: NodeResult): StepResult {
  const presented = env.frame.outputs[PRESENTED_KEY];
  const lane =
    typeof presented === 'number'
      ? lanesOf(env.frame).find((held) => held.index === presented)
      : routed(lanesOf(env.frame), result);
  if (lane === undefined) {
    throw new InterpreterError('a parallel region', 'a branch waiting for a result', 'none');
  }
  return drive(env, lane.index, { kind: 'resolved', now: env.now, result });
}

function reasonFor(verdict: Verdict): CancelReason {
  const done = verdict.kind === 'completion' ? verdict.completion : undefined;
  return done?.kind === 'cancelled' ? done.reason : 'parent_cancelled';
}

function cancelling(env: Env, frame: Frame): Frame {
  const verdict = verdictOf(frame);
  if (verdict === undefined) return frame;
  const reason = reasonFor(verdict);
  const lanes = lanesOf(frame).map((lane) => {
    if (terminal(lane) || lane.cancelRequested) return lane;
    const { wait: _wait, ...rest } = lane;
    return {
      ...rest,
      status: 'ready' as const,
      cancel: { reason, requestedAt: env.now },
      cancelRequested: true,
    };
  });
  return withLanes(frame, lanes);
}

function refreshed(env: Env, region: Region): Frame {
  let frame = region.tidy(env.frame);
  if (verdictOf(frame) === undefined) {
    const verdict = region.judge(frame, lanesOf(frame));
    if (verdict !== undefined) frame = withVerdict(frame, verdict);
  }
  if (verdictOf(frame) === undefined) frame = region.fill(env, frame);
  return cancelling(env, frame);
}

function combined(env: Env, waiting: readonly Lane[]): Wait | undefined {
  const waits = waiting.flatMap((lane) => leavesOf(lane.wait));
  const [only] = waits;
  if (only === undefined) return undefined;
  if (waits.length === 1) return only;
  return { kind: 'any', nodePath: env.path, durable: waits.every((w) => w.durable), waits };
}

function present(env: Env, lanes: readonly Lane[]): StepResult {
  const wait = combined(
    env,
    lanes.filter((lane) => lane.status === 'waiting'),
  );
  if (wait === undefined) {
    const error = FLOW_ERRORS.Failed('no branch of the parallel region can run', siteOf(env));
    return complete(env, env.state, { kind: 'error', error });
  }
  return stay(env, { ...env.state, wait }, { kind: 'park', wait });
}

export function advance(env: Env, region: Region): StepResult {
  const frame = refreshed(env, region);
  const here = deriveEnv(
    env,
    withTop(env.state, () => frame),
  );
  const verdict = verdictOf(frame);
  const lanes = lanesOf(frame);
  if (verdict !== undefined && lanes.every(terminal)) {
    return verdict.kind === 'completion'
      ? propagate(here, verdict.completion)
      : region.finish(here, frame, verdict.winners);
  }
  const ready = lanes.find((lane) => lane.status === 'ready');
  if (ready === undefined) return present(here, lanes);
  return drive(here, ready.index, { kind: 'run', now: env.now });
}

function finishParallel(
  env: Env,
  op: OpOf['parallel'],
  frame: Frame,
  winners: readonly number[],
): StepResult {
  const lanes = lanesOf(frame);
  const produced = winners.reduce<Record<string, JsonValue>>(
    (merged, index) => ({ ...merged, ...lanes.find((lane) => lane.index === index)?.produced }),
    {},
  );
  const settled = op.join === 'settled' ? { ...produced, status: statusList(lanes) } : produced;
  const popped = popFrame(absorb(env, env.state));
  const state =
    op.outputs === undefined && op.join !== 'settled'
      ? popped
      : setOutputs(popped, op.at.key, JSON_VALUE.parse(settled));
  return next(deriveEnv(env, state), state);
}

function parallelRegion(op: OpOf['parallel']): Region {
  return {
    tidy: (frame) => frame,
    fill: (_env, frame) => frame,
    judge: (_frame, lanes) => judgeParallel(op, lanes),
    finish: (env, frame, winners) => finishParallel(env, op, frame, winners),
  };
}

function startParallel(env: Env, op: OpOf['parallel']): StepResult {
  const refused = widthBreach(env, op.branches.length);
  if (refused !== null) return refused;
  const frame = newFrame(env.state, 'parallel', env.path);
  const lanes = op.branches.map((branch, index) =>
    newLane(index, branch.name, {
      id: `${frame.id}.${String(index)}`,
      kind: 'branch',
      path: `${env.path}/branches/${String(index)}/body`,
      pc: 0,
      locals: { scope: branch.name },
      outputs: {},
    }),
  );
  return stay(env, pushFrame(env.state, withLanes(frame, lanes)));
}

function enterParallel(env: Env, op: OpOf['parallel']): StepResult {
  return env.frame.kind === 'parallel' ? advance(env, parallelRegion(op)) : startParallel(env, op);
}

function reenter(env: Env): StepResult {
  const { op } = env;
  if (op?.op === 'parallel') return enterParallel(env, op);
  const handler = op?.op === 'loop' ? env.ctx.ops.loop : undefined;
  if (op?.op !== 'loop' || handler === undefined) return unsupported(env, 'a parallel region');
  return handler.enter(env, op);
}

function parallelFrame(env: Env, completion: Completion): StepResult {
  if (env.frame.outputs[ACTIVE_KEY] !== undefined) {
    const landed = JSON_VALUE.parse(completion);
    return stay(
      env,
      withTop(env.state, (frame) => withOutputs(frame, { [LANDED_KEY]: landed })),
    );
  }
  const verdict: Verdict = { kind: 'completion', completion };
  const state = withTop(env.state, (frame) =>
    verdictOf(frame) === undefined ? withVerdict(frame, verdict) : frame,
  );
  return reenter(deriveEnv(env, state));
}

export const PARALLEL_OPS: OpHandlers = {
  parallel: { enter: enterParallel, settle: (env, _op, result) => settleRegion(env, result) },
};

export const PARALLEL_FRAMES: FrameHandlers = { parallel: parallelFrame };
