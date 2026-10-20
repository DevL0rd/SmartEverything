import { beltSteps, type ControlTarget } from '@smarteverything/ble';
import type {
  BeltState,
  ControlResult,
  TreadmillFamily,
  TreadmillWriteStep,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceState } from './fleet';

export const STOP_SETTLE_MS = 5_000;

const STOP_OPCODE = 0x08;

const MOVING: readonly BeltState[] = ['running', 'countdown'];

const ENDED: readonly BeltState[] = ['stopped', 'idle', 'standby', 'safety_stop'];

const HALTED: readonly BeltState[] = ['paused', ...ENDED];

export const BELT_STOPPED = 'The belt stopped.';

export const BELT_KEPT_PAUSED =
  'The belt is paused. The treadmill kept the walk open; press stop on its panel to end it.';

export class BeltStopFailedError extends Error {
  override readonly name = 'BeltStopFailedError';
}

export interface StopIo {
  readonly deviceId: string;
  readonly family: TreadmillFamily;
  readonly target: ControlTarget;
  readonly log: Logger;
  readonly write: (steps: readonly TreadmillWriteStep[]) => Promise<string>;
}

type StopStep = 'pause' | 'stop';

function replySince(state: DeviceState, mark: number): ControlResult | null {
  const reply = state.runtime.replies.get(STOP_OPCODE);
  return reply !== undefined && reply.seq > mark ? reply.result : null;
}

async function writeUntil(
  io: StopIo,
  state: DeviceState,
  step: StopStep,
  wanted: readonly BeltState[],
): Promise<boolean> {
  const mark = state.runtime.replySeq;
  await io.write(beltSteps(io.family, io.target, { kind: step }));
  const reached = await state.until(
    () => wanted.includes(state.runtime.machine.state),
    STOP_SETTLE_MS,
  );
  io.log.info('treadmill.stop_step', {
    device: io.deviceId,
    step,
    reached,
    state: state.runtime.machine.state,
    reply: replySince(state, mark),
  });
  return reached;
}

export async function stopBelt(io: StopIo, state: DeviceState): Promise<string> {
  if (io.family === 'wilink') {
    return io.write(beltSteps(io.family, io.target, { kind: 'stop' }));
  }
  const moving = MOVING.includes(state.runtime.machine.state);
  if (moving && !(await writeUntil(io, state, 'pause', HALTED))) {
    throw new BeltStopFailedError('The belt did not stop. Press stop on the treadmill’s panel.');
  }
  if (await writeUntil(io, state, 'stop', ENDED)) {
    return BELT_STOPPED;
  }
  io.log.warn('treadmill.stop_kept_paused', { device: io.deviceId });
  return BELT_KEPT_PAUSED;
}
