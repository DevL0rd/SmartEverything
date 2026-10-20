import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { iterationBreach } from '../state/budgets';
import { breachError } from '../state/errors';
import type { Completion, Frame, LoopState } from '../state/run-state';
import { CORE_FRAMES } from './core-ops';
import type {
  Checked,
  Env,
  FrameHandler,
  FrameHandlers,
  NodeResult,
  OpHandlers,
  OpOf,
  StepResult,
} from './frames';
import {
  InterpreterError,
  absorb,
  asRecord,
  deriveEnv,
  mismatch,
  newFrame,
  next,
  popFrame,
  present,
  propagate,
  pushFrame,
  raise,
  setOutputs,
  siteOf,
  stay,
} from './frames';
import { judgeEach, terminal } from './join';
import type { Lane, Verdict } from './join';
import { LOOP_OPS } from './loops';
import {
  COLLECT_KEY,
  advance,
  lanesOf,
  newLane,
  settleRegion,
  widthBreach,
  withLanes,
  withOutputs,
  withVerdict,
} from './parallel';
import type { Region } from './parallel';
import { evaluate } from './step';

type LoopOp = OpOf['loop'];

type Items = Extract<LoopOp['source'], { kind: 'items' }>;

type EachOp = LoopOp & { readonly source: Items };

const COLLECTED_KEY = '$collected';

const JSON_LIST = z.array(JSON_VALUE);

export function concurrent(op: LoopOp): op is EachOp {
  return op.source.kind === 'items' && op.source.concurrency > 1;
}

function loopOf(frame: Frame): LoopState {
  if (frame.loop === undefined) {
    throw new InterpreterError('a concurrent for each', 'loop state', 'none');
  }
  return frame.loop;
}

function scopeOutputs(loop: LoopState, index: number): Record<string, JsonValue> {
  const item = loop.items?.[index];
  const count = loop.count ?? 0;
  return {
    index,
    position: index + 1,
    count,
    first: index === 0,
    last: index === count - 1,
    ...(item === undefined ? {} : { item }),
  };
}

function iterationLane(env: Env, op: EachOp, frame: Frame, index: number): Lane {
  const bottom: Frame = {
    id: `${frame.id}.${String(index)}`,
    kind: 'branch',
    path: `${env.path}/body`,
    pc: 0,
    locals: { iteration: index },
    outputs: { [op.at.key]: scopeOutputs(loopOf(frame), index) },
  };
  return newLane(index, `${op.at.key}[${String(index)}]`, bottom);
}

function retire(frame: Frame): Frame {
  const lanes = lanesOf(frame);
  const finished = lanes.filter((lane) => lane.status === 'done');
  if (finished.length === 0) return frame;
  const collected: Record<string, JsonValue> = { ...asRecord(frame.outputs[COLLECTED_KEY]) };
  for (const lane of finished) {
    if (lane.collected !== undefined) collected[String(lane.index)] = lane.collected;
  }
  const kept = withOutputs(frame, { [COLLECTED_KEY]: collected });
  return withLanes(
    kept,
    lanes.filter((lane) => lane.status !== 'done'),
  );
}

function admit(env: Env, op: EachOp, frame: Frame): Frame {
  const loop = loopOf(frame);
  const lanes = [...lanesOf(frame)];
  let { index } = loop;
  const count = loop.count ?? 0;
  while (index < count && lanes.filter((lane) => !terminal(lane)).length < op.source.concurrency) {
    const breach = iterationBreach(index + 1, env.ctx.limits.loopIterations);
    if (breach !== null) {
      const error = breachError(breach, siteOf(env), env.state.runId);
      return withVerdict(frame, { kind: 'completion', completion: { kind: 'error', error } });
    }
    lanes.push(iterationLane(env, op, frame, index));
    index += 1;
  }
  return withLanes({ ...frame, loop: { ...loop, index } }, lanes);
}

function finishEach(env: Env, op: EachOp, frame: Frame): StepResult {
  const collected = asRecord(frame.outputs[COLLECTED_KEY]);
  const results = Object.entries(collected)
    .sort(([first], [second]) => Number(first) - Number(second))
    .map(([, value]) => value);
  const popped = popFrame(absorb(env, env.state));
  const state =
    op.source.collect === undefined ? popped : setOutputs(popped, op.at.key, { results });
  return next(deriveEnv(env, state), state);
}

function eachRegion(op: EachOp): Region {
  return {
    tidy: retire,
    fill: (env, frame) => admit(env, op, frame),
    judge: (frame, lanes): Verdict | undefined => {
      const loop = loopOf(frame);
      return judgeEach(op.at.key, (loop.count ?? 0) - loop.index, lanes);
    },
    finish: (env, frame) => finishEach(env, op, frame),
  };
}

function itemsOf(env: Env, source: Items): Checked<readonly JsonValue[]> {
  const list = evaluate(env, source.items);
  if (!list.ok) return list;
  const parsed = JSON_LIST.safeParse(list.value);
  if (!parsed.success) return mismatch('the list', 'a list', list.value);
  return { ok: true, value: source.reverse ? [...parsed.data].reverse() : parsed.data };
}

function startEach(env: Env, op: EachOp): StepResult {
  const items = itemsOf(env, op.source);
  if (!items.ok) return raise(env, items);
  if (items.value.length === 0) {
    const state =
      op.source.collect === undefined
        ? env.state
        : setOutputs(env.state, op.at.key, { results: [] });
    return next(env, state);
  }
  const refused = widthBreach(env, Math.min(op.source.concurrency, items.value.length));
  if (refused !== null) return refused;
  const loop: LoopState = {
    index: 0,
    count: items.value.length,
    items: [...items.value],
    startedAt: env.now,
  };
  const frame = withLanes(newFrame(env.state, 'parallel', env.path), []);
  return stay(env, pushFrame(env.state, { ...frame, loop }));
}

function sequentialLoop(): NonNullable<OpHandlers['loop']> {
  const handler = LOOP_OPS.loop;
  if (handler === undefined) {
    throw new InterpreterError('the loop operations', 'a sequential loop handler', 'none');
  }
  return handler;
}

function enterLoop(env: Env, op: LoopOp): StepResult {
  if (!concurrent(op)) return sequentialLoop().enter(env, op);
  return env.frame.kind === 'parallel' ? advance(env, eachRegion(op)) : startEach(env, op);
}

function settleLoop(env: Env, op: LoopOp, result: NodeResult): StepResult {
  if (concurrent(op)) return settleRegion(env, result);
  const settle = sequentialLoop().settle;
  if (settle === undefined) {
    throw new InterpreterError('the loop operations', 'a gap resolution handler', 'none');
  }
  return settle(env, op, result);
}

function coreBranch(): FrameHandler {
  const handler = CORE_FRAMES.branch;
  if (handler === undefined) {
    throw new InterpreterError('the core frames', 'a scope handler', 'none');
  }
  return handler;
}

function endIteration(env: Env, op: EachOp, withCollect: boolean): StepResult {
  const collect = op.source.collect;
  let value: JsonValue | undefined;
  if (withCollect && collect !== undefined) {
    const got = present(evaluate(env, collect), 'the collected value');
    if (!got.ok) return raise(env, got);
    value = got.value;
  }
  const popped = popFrame(absorb(env, env.state));
  const state = value === undefined ? popped : setOutputs(popped, COLLECT_KEY, value);
  return next(deriveEnv(env, state), state);
}

function iterationFrame(env: Env, completion: Completion): StepResult {
  if (env.frame.locals['iteration'] === undefined) return coreBranch()(env, completion);
  const { op } = deriveEnv(env, popFrame(env.state));
  if (op?.op !== 'loop' || !concurrent(op)) {
    throw new InterpreterError(
      'a concurrent iteration',
      'a concurrent for each below it',
      op?.op ?? 'none',
    );
  }
  if (completion.kind === 'normal') return endIteration(env, op, true);
  if (completion.kind === 'continue' && completion.target === op.at.key) {
    return endIteration(env, op, false);
  }
  return propagate(env, completion);
}

export const CONCURRENT_EACH_OPS: OpHandlers = { loop: { enter: enterLoop, settle: settleLoop } };

export const CONCURRENT_EACH_FRAMES: FrameHandlers = { branch: iterationFrame };
