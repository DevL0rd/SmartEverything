import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import { CANCEL_REASON } from '../state/run-state';
import type { CancelReason, Completion, Frame, RunState } from '../state/run-state';

export const CLEANUP_GRACE_MS = 30_000;

export const CLEANUP_KEY = '$cleanup';

const CLEANUP = z.strictObject({ reason: CANCEL_REASON, startedAt: z.int().min(0) });

export function cancelCompletion(reason: CancelReason): Completion {
  return { kind: 'cancelled', reason };
}

export function requestCancel(state: RunState, reason: CancelReason, now: number): RunState {
  return state.cancel === undefined ? { ...state, cancel: { reason, requestedAt: now } } : state;
}

function withoutCancel(state: RunState): RunState {
  const { cancel: _cancel, ...rest } = state;
  return rest;
}

export function beginCleanup(state: RunState, reason: CancelReason, now: number): RunState {
  const marked = state.frames.map((frame, index) =>
    index === state.frames.length - 1
      ? {
          ...frame,
          outputs: {
            ...frame.outputs,
            [CLEANUP_KEY]: JSON_VALUE.parse({ reason, startedAt: now }),
          },
        }
      : frame,
  );
  return withoutCancel({ ...state, frames: marked });
}

function cleanupOf(frame: Frame): z.infer<typeof CLEANUP> | undefined {
  const parsed = CLEANUP.safeParse(frame.outputs[CLEANUP_KEY]);
  return parsed.success ? parsed.data : undefined;
}

function cleanups(state: RunState): readonly z.infer<typeof CLEANUP>[] {
  return state.frames.flatMap((frame) => cleanupOf(frame) ?? []);
}

export function isCleaning(state: RunState): boolean {
  return cleanups(state).length > 0;
}

export function cleanupGraceEnd(state: RunState): number | undefined {
  const starts = cleanups(state).map((cleanup) => cleanup.startedAt);
  return starts.length === 0 ? undefined : Math.min(...starts) + CLEANUP_GRACE_MS;
}

export function abandonCleanup(state: RunState, now: number): RunState {
  const [first] = cleanups(state);
  return first === undefined ? state : requestCancel(state, first.reason, now);
}
