import type { FlowError, LoopLimit } from '@smarteverything/domain';
import type { LoopGap } from '../compile/plan-parts';
import { FLOW_ERRORS } from '../state/errors';
import type { ErrorSite } from '../state/errors';
import type { LoopState, RunState, Wait } from '../state/run-state';

export const LOOP_ADMIT = 'admit';

export const DEFAULT_LIMIT_NOTE = 'The loop reached its limit and stopped.';

export type LimitKind = 'time' | 'iterations';

export interface Hit {
  readonly kind: LimitKind;
  readonly limit: LoopLimit;
}

export function deadlineFor(limit: LoopLimit | undefined, now: number): number | undefined {
  return limit?.time === undefined ? undefined : now + limit.time;
}

export function timeHit(limit: LoopLimit | undefined, loop: LoopState, now: number): Hit | null {
  const passed = loop.deadlineAt !== undefined && now >= loop.deadlineAt;
  return limit !== undefined && passed ? { kind: 'time', limit } : null;
}

export function iterationsHit(limit: LoopLimit | undefined, loop: LoopState): Hit | null {
  const reached = limit?.iterations !== undefined && loop.index >= limit.iterations;
  return limit !== undefined && reached ? { kind: 'iterations', limit } : null;
}

export function gapFor(gap: LoopGap, loop: LoopState, now: number): number {
  if (!gap.clipToDeadline || loop.deadlineAt === undefined) return gap.ms;
  return Math.min(gap.ms, Math.max(0, loop.deadlineAt - now));
}

export function gapWait(state: RunState, nodePath: string, dueAt: number): Wait {
  const durable = !state.frames.some((frame) => frame.kind === 'with_effect');
  return { kind: 'duration', nodePath, durable, dueAt };
}

export function withoutLimitCancel(state: RunState): RunState {
  if (state.cancel?.reason !== 'loop_limit') return state;
  const { cancel: _cancel, ...rest } = state;
  return rest;
}

function describe(hit: Hit, key: string): string {
  return hit.kind === 'time'
    ? `${key} reached its time limit of ${String(hit.limit.time)} ms`
    : `${key} reached its limit of ${String(hit.limit.iterations)} iterations`;
}

export function limitError(hit: Hit, key: string, site: ErrorSite): FlowError {
  return FLOW_ERRORS.LimitExceeded(describe(hit, key), site, {
    detail: { limit: hit.kind, nodePath: site.path },
  });
}
