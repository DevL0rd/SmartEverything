import { beltSteps, type ControlTarget } from '@smarteverything/ble';
import {
  CommandRefusedError,
  NO_STEPS_SECONDS,
  inclineVerdict,
  type ControlResult,
  type DeviceCommand,
  type InclineCaller,
  type Starter,
  type TreadmillFamily,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { entrySettingsOf } from './config';
import type { DeviceState } from './fleet';

export const INCLINE_SETTLE_MS = 10_000;

const INCLINES_IN_FLIGHT = new WeakSet<DeviceState>();

const STEPS_SEEN_MS = NO_STEPS_SECONDS * 1000;

const EPSILON = 1e-6;

export class InclineFailedError extends Error {
  override readonly name = 'InclineFailedError';
}

export interface InclineIo {
  readonly family: TreadmillFamily;
  readonly target: ControlTarget;
  readonly write: (steps: readonly TreadmillWriteStep[]) => Promise<string>;
}

export function sameIncline(first: number, second: number): boolean {
  return Math.abs(first - second) < EPSILON;
}

export function inclineCaller(state: DeviceState, starter: Starter, now: Date): InclineCaller {
  const { machine, lastStepAt } = state.runtime;
  const moving = machine.state === 'running' || machine.state === 'paused';
  return {
    owner: starter.owner,
    walker: starter.walker,
    remote: starter.remote,
    held: !starter.remote,
    stepsSeen:
      moving && lastStepAt !== null && now.getTime() - Date.parse(lastStepAt) <= STEPS_SEEN_MS,
  };
}

export function inclineBlock(state: DeviceState): string | null {
  return state.runtime.machine.state === 'fault'
    ? 'The belt reports a fault, so the incline is not changed.'
    : null;
}

function replyMark(state: DeviceState): number {
  return state.runtime.replySeq;
}

async function awaitReply(
  state: DeviceState,
  opcode: number,
  mark: number,
): Promise<ControlResult | null> {
  const answered = await state.until(
    () => (state.runtime.replies.get(opcode)?.seq ?? 0) > mark,
    INCLINE_SETTLE_MS,
  );
  return answered ? (state.runtime.replies.get(opcode)?.result ?? null) : null;
}

function refusalOf(result: ControlResult): string {
  return result === 'not_permitted'
    ? 'KS Fit or another app has control of the belt. Close it and try again.'
    : 'The belt refused the incline change. Check the belt’s panel.';
}

function failure(): InclineFailedError {
  return new InclineFailedError('The belt did not change its incline.');
}

function arrived(state: DeviceState, to: number, statusMark: number): boolean {
  const { machine, inclineStatusSeq } = state.runtime;
  const { inclinePercent, targetInclinePercent } = machine.live;
  return (
    (inclinePercent !== undefined && sameIncline(inclinePercent, to)) ||
    (inclineStatusSeq > statusMark &&
      targetInclinePercent !== undefined &&
      sameIncline(targetInclinePercent, to))
  );
}

async function settle(state: DeviceState, to: number, statusMark: number): Promise<void> {
  let seen = state.runtime.machine.live.inclinePercent;
  for (;;) {
    const moved = await state.until(
      () => arrived(state, to, statusMark) || state.runtime.machine.live.inclinePercent !== seen,
      INCLINE_SETTLE_MS,
    );
    if (!moved) {
      throw failure();
    }
    if (arrived(state, to, statusMark)) {
      return;
    }
    seen = state.runtime.machine.live.inclinePercent;
  }
}

export async function stepIncline(io: InclineIo, state: DeviceState, to: number): Promise<void> {
  const mark = replyMark(state);
  const statusMark = state.runtime.inclineStatusSeq;
  await io.write(beltSteps(io.family, io.target, { kind: 'incline', percent: to }));
  const result = await awaitReply(state, 0x03, mark);
  if (result === null) {
    throw failure();
  }
  if (result !== 'success') {
    throw new InclineFailedError(refusalOf(result));
  }
  await settle(state, to, statusMark);
}

export interface InclineRun {
  readonly command: DeviceCommand;
  readonly state: DeviceState;
  readonly starter: Starter;
  readonly now: Date;
  readonly io: InclineIo;
  readonly target: number;
  readonly log: Logger;
}

function reached(at: number | null, final: number | null): final is number {
  return final !== null && at !== null && sameIncline(at, final);
}

function nextStep(
  { command, state, starter, now, target }: InclineRun,
  at: number | null,
  started: boolean,
): { readonly step: number; readonly final: number } {
  const verdict = inclineVerdict(
    { target, current: at },
    state.runtime.identity,
    entrySettingsOf(state.entry).policy,
    inclineCaller(state, starter, now),
  );
  const reason = inclineBlock(state) ?? (verdict.allowed ? null : verdict.reason);
  if (reason === null && verdict.allowed) {
    return verdict;
  }
  throw started
    ? new InclineFailedError(`${reason ?? ''} The incline stopped at ${String(at)}.`)
    : new CommandRefusedError(command.capability, (reason ?? '').replace(/\.$/, ''));
}

async function climb(run: InclineRun): Promise<string> {
  const from = run.state.runtime.machine.live.inclinePercent ?? null;
  let at = from;
  let final: number | null = null;
  let started = false;
  while (!reached(at, final)) {
    const next = nextStep(run, at, started);
    final = next.final;
    await stepIncline(run.io, run.state, next.step);
    at = next.step;
    started = true;
  }
  run.log.info('treadmill.incline_changed', {
    device: run.state.entry.externalId,
    from,
    to: final,
  });
  return `The incline is now ${String(final)}.`;
}

export async function runIncline(run: InclineRun): Promise<string> {
  const { command, state } = run;
  if (INCLINES_IN_FLIGHT.has(state)) {
    throw new CommandRefusedError(command.capability, 'an incline change is already in progress');
  }
  INCLINES_IN_FLIGHT.add(state);
  try {
    return await climb(run);
  } finally {
    INCLINES_IN_FLIGHT.delete(state);
  }
}
