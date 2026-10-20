import { JSON_VALUE } from '@smarteverything/domain';
import type { FlowError } from '@smarteverything/domain';
import { z } from 'zod';
import { CANCEL_REASON, COMPLETION, FRAME, WAIT } from '../state/run-state';

export interface JoinSpec {
  readonly join: 'all' | 'first' | 'settled';
  readonly errors: 'failFast' | 'settle';
}

export const LANE = z.strictObject({
  index: z.int().min(0),
  name: z.string().min(1),
  status: z.enum(['ready', 'waiting', 'effecting', 'done', 'ended']),
  frames: z.array(FRAME),
  wait: WAIT.optional(),
  cancel: z.strictObject({ reason: CANCEL_REASON, requestedAt: z.int().min(0) }).optional(),
  cancelRequested: z.boolean(),
  produced: z.record(z.string(), JSON_VALUE),
  collected: JSON_VALUE.optional(),
  completion: COMPLETION.optional(),
  seq: z.int().min(0),
});

export type Lane = z.infer<typeof LANE>;

export const LANES = z.array(LANE);

export const VERDICT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('normal'), winners: z.array(z.int().min(0)) }),
  z.strictObject({ kind: z.literal('completion'), completion: COMPLETION }),
]);

export type Verdict = z.infer<typeof VERDICT>;

export interface BranchStatus {
  readonly branch: string;
  readonly ok: boolean;
  readonly error?: FlowError;
}

export function terminal(lane: Lane): boolean {
  return lane.status === 'done' || lane.status === 'ended';
}

function bySeq(first: Lane, second: Lane): number {
  return first.seq - second.seq;
}

function errorOf(lane: Lane): FlowError | undefined {
  const { completion } = lane;
  return completion?.kind === 'error' ? completion.error : undefined;
}

function expected(lane: Lane, loopKey: string | undefined): boolean {
  const { completion } = lane;
  if (completion === undefined) return false;
  if (completion.kind === 'error') return true;
  if (completion.kind === 'cancelled') return lane.cancelRequested;
  return completion.kind === 'break' && loopKey !== undefined && completion.target === loopKey;
}

function ended(lanes: readonly Lane[]): Lane[] {
  return lanes.filter((lane) => lane.status === 'ended').sort(bySeq);
}

function abortOf(lanes: readonly Lane[], loopKey: string | undefined): Verdict | undefined {
  const lane = ended(lanes).find((held) => !expected(held, loopKey));
  return lane?.completion === undefined
    ? undefined
    : { kind: 'completion', completion: lane.completion };
}

function raised(lane: Lane | undefined): Verdict | undefined {
  const error = lane === undefined ? undefined : errorOf(lane);
  return error === undefined
    ? undefined
    : { kind: 'completion', completion: { kind: 'error', error } };
}

function normal(lanes: readonly Lane[]): Verdict {
  return {
    kind: 'normal',
    winners: lanes
      .filter((lane) => lane.status === 'done')
      .map((lane) => lane.index)
      .sort((first, second) => first - second),
  };
}

function errorsOf(lanes: readonly Lane[]): Lane[] {
  return ended(lanes).filter((lane) => errorOf(lane) !== undefined);
}

function joinAll(spec: JoinSpec, lanes: readonly Lane[]): Verdict | undefined {
  const first = errorsOf(lanes)[0];
  const finished = lanes.every(terminal);
  if (first !== undefined && (spec.errors === 'failFast' || finished)) return raised(first);
  return finished ? normal(lanes) : undefined;
}

function decisive(spec: JoinSpec, lanes: readonly Lane[]): Lane | undefined {
  const done = lanes.filter((lane) => lane.status === 'done');
  const candidates = spec.errors === 'failFast' ? [...done, ...errorsOf(lanes)] : done;
  return candidates.sort(bySeq)[0];
}

function joinFirst(spec: JoinSpec, lanes: readonly Lane[]): Verdict | undefined {
  const lane = decisive(spec, lanes);
  if (lane?.status === 'done') return { kind: 'normal', winners: [lane.index] };
  if (lane !== undefined) return raised(lane);
  return lanes.every(terminal) ? raised(errorsOf(lanes)[0]) : undefined;
}

export function judgeParallel(spec: JoinSpec, lanes: readonly Lane[]): Verdict | undefined {
  const aborted = abortOf(lanes, undefined);
  if (aborted !== undefined) return aborted;
  switch (spec.join) {
    case 'settled':
      return lanes.every(terminal) ? normal(lanes) : undefined;
    case 'all':
      return joinAll(spec, lanes);
    case 'first':
      return joinFirst(spec, lanes);
  }
}

export function judgeEach(
  loopKey: string,
  pending: number,
  lanes: readonly Lane[],
): Verdict | undefined {
  const deciding = ended(lanes).find(
    (lane) =>
      lane.completion !== undefined &&
      !(lane.completion.kind === 'cancelled' && lane.cancelRequested),
  );
  const completion = deciding?.completion;
  if (completion !== undefined) {
    return completion.kind === 'break' && completion.target === loopKey
      ? { kind: 'normal', winners: [] }
      : { kind: 'completion', completion };
  }
  return pending === 0 && lanes.every(terminal) ? { kind: 'normal', winners: [] } : undefined;
}

export function statusList(lanes: readonly Lane[]): readonly BranchStatus[] {
  return [...lanes]
    .sort((first, second) => first.index - second.index)
    .map((lane) => {
      const error = errorOf(lane);
      return {
        branch: lane.name,
        ok: lane.status === 'done',
        ...(error === undefined ? {} : { error }),
      };
    });
}
