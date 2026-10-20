import type { Frame, RunState, SingleWait, Wait } from '../state/run-state';
import { requestCancel } from './cancel';
import type { Env, StepResult } from './frames';
import { atLoopLevel, completeFrame, deriveEnv, executes, traceNode } from './frames';
import { LOOP_ADMIT } from './loops-limits';

function inPass(frame: Frame, top: boolean): boolean {
  return !(top && frame.locals['phase'] === LOOP_ADMIT);
}

export function passDeadline(state: RunState): number | undefined {
  const last = state.frames.length - 1;
  return state.frames.reduce<number | undefined>((earliest, frame, index) => {
    const deadline = frame.loop?.deadlineAt;
    if (deadline === undefined || !inPass(frame, index === last)) return earliest;
    return earliest === undefined ? deadline : Math.min(earliest, deadline);
  }, undefined);
}

function clipSingle(wait: SingleWait, limit: number): SingleWait {
  switch (wait.kind) {
    case 'duration':
    case 'until_instant':
      return { ...wait, dueAt: Math.min(wait.dueAt, limit) };
    case 'condition':
    case 'event':
    case 'answer':
      return { ...wait, deadlineAt: Math.min(wait.deadlineAt ?? limit, limit) };
    case 'refill':
    case 'breakpoint':
      return wait;
  }
}

function clipped(wait: Wait, limit: number): Wait {
  return wait.kind === 'any'
    ? { ...wait, waits: wait.waits.map((single) => clipSingle(single, limit)) }
    : clipSingle(wait, limit);
}

export function clipToPass(result: StepResult): StepResult {
  const { outcome, state } = result;
  if (outcome.kind !== 'park') return result;
  const limit = passDeadline(state);
  if (limit === undefined) return result;
  const wait = clipped(outcome.wait, limit);
  return { ...result, state: { ...state, wait }, outcome: { ...outcome, wait } };
}

export function passExpired(state: RunState, now: number): boolean {
  const limit = passDeadline(state);
  return state.cancel === undefined && limit !== undefined && now >= limit;
}

export function interruptPass(env: Env, resolving: boolean): StepResult {
  if (resolving && executes(env.op) && !atLoopLevel(env)) traceNode(env, 'cancelled');
  const { wait: _wait, ...rest } = requestCancel(env.state, 'loop_limit', env.now);
  return completeFrame(deriveEnv(env, rest), { kind: 'cancelled', reason: 'loop_limit' });
}
