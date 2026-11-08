import {
  CommandRefusedError,
  IR_AC_MODES,
  IR_SPEED_STEPS,
  buttonLabel,
  keyFor,
  modeKeysOf,
  type IrApplianceApply,
  type IrApplianceKeyRow,
  type IrRemoteState,
  type RemoteRole,
} from '@smarteverything/domain';
import { LEARNED_ENCODER } from '../store/repositories/ir-appliances';

export interface IrFrame {
  readonly key: string;
  readonly format: IrApplianceKeyRow['format'];
  readonly code: string;
}

export interface IrEncoder {
  readonly id: string;
  readonly frames: (
    keys: readonly IrApplianceKeyRow[],
    from: IrRemoteState,
    goal: IrApplianceApply,
  ) => readonly IrFrame[];
}

export class IrEncoderUnknownError extends Error {
  override readonly name = 'IrEncoderUnknownError';

  constructor(readonly encoder: string) {
    super(`No IR encoder named ${encoder} is installed on this hub.`);
  }
}

interface Presses {
  readonly keys: readonly IrApplianceKeyRow[];
  readonly field: string;
}

function keyOfRole({ keys, field }: Presses, role: RemoteRole): IrApplianceKeyRow {
  const name = keyFor(
    keys.map((key) => key.button),
    role,
  );
  const key = keys.find((candidate) => candidate.button === name);
  if (key === undefined) {
    throw new CommandRefusedError(field, `it has no learned ${role.replaceAll('_', ' ')} button`);
  }
  return key;
}

function repeated(key: IrApplianceKeyRow, times: number): IrApplianceKeyRow[] {
  return Array.from({ length: times }, () => key);
}

export function known<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new CommandRefusedError(field, `its current ${field} is not known, correct it first`);
  }
  return value;
}

function steps(
  presses: Presses,
  from: number,
  to: number,
  roles: readonly [RemoteRole, RemoteRole],
): IrApplianceKeyRow[] {
  const [up, down] = roles;
  return to === from
    ? []
    : repeated(keyOfRole(presses, to > from ? up : down), Math.abs(to - from));
}

function modePresses(presses: Presses, from: IrRemoteState, mode: string): IrApplianceKeyRow[] {
  const direct = modeKeysOf(presses.keys.map((key) => key.button)).find(
    (button) => buttonLabel(button) === mode,
  );
  const key = presses.keys.find((candidate) => candidate.button === direct);
  if (key !== undefined) {
    return from.mode === mode ? [] : [key];
  }
  const at = IR_AC_MODES.findIndex((candidate) => candidate === known(from.mode, 'mode'));
  const to = IR_AC_MODES.findIndex((candidate) => candidate === mode);
  const times = (to - at + IR_AC_MODES.length) % IR_AC_MODES.length;
  return times === 0 ? [] : repeated(keyOfRole(presses, 'mode'), times);
}

function speedPresses(presses: Presses, from: IrRemoteState, speed: number): IrApplianceKeyRow[] {
  const current = known(from.speed, 'fan speed');
  const buttons = presses.keys.map((key) => key.button);
  if (keyFor(buttons, 'speed_up') !== undefined && keyFor(buttons, 'speed_down') !== undefined) {
    return steps(presses, current, speed, ['speed_up', 'speed_down']);
  }
  const times = (speed - current + IR_SPEED_STEPS) % IR_SPEED_STEPS;
  return times === 0 ? [] : repeated(keyOfRole(presses, 'speed_cycle'), times);
}

function settingPresses(
  keys: readonly IrApplianceKeyRow[],
  from: IrRemoteState,
  goal: IrApplianceApply,
): IrApplianceKeyRow[] {
  return [
    ...(goal.mode === undefined ? [] : modePresses({ keys, field: 'mode' }, from, goal.mode)),
    ...(goal.temp === undefined
      ? []
      : steps({ keys, field: 'temperature' }, known(from.temp, 'temperature'), goal.temp, [
          'temp_up',
          'temp_down',
        ])),
    ...(goal.speed === undefined
      ? []
      : speedPresses({ keys, field: 'fan speed' }, from, goal.speed)),
  ];
}

function learnedFrames(
  keys: readonly IrApplianceKeyRow[],
  from: IrRemoteState,
  goal: IrApplianceApply,
): readonly IrFrame[] {
  const power = { keys, field: 'power' };
  const wasOn = goal.on === undefined ? from.on : known(from.on, 'power');
  const turnOn = goal.on === true && wasOn === false;
  const turnOff = goal.on === false && wasOn === true;
  const settings = settingPresses(keys, from, goal);
  if (settings.length > 0 && !turnOn && !known(wasOn, 'power')) {
    throw new CommandRefusedError('state', 'it is off, so turn it on in the same request');
  }
  const presses = [
    ...(turnOn ? [keyOfRole(power, 'power')] : []),
    ...settings,
    ...(turnOff ? [keyOfRole(power, 'power')] : []),
  ];
  return presses.map(({ button, format, code }) => ({ key: button, format, code }));
}

export const LEARNED_KEYS_ENCODER: IrEncoder = { id: LEARNED_ENCODER, frames: learnedFrames };

export interface IrEncoderFamily {
  readonly prefix: string;
  readonly encoder: (name: string) => IrEncoder;
}

export class IrEncoders {
  private readonly byId = new Map<string, IrEncoder>();

  constructor(
    encoders: readonly IrEncoder[],
    private readonly families: readonly IrEncoderFamily[] = [],
  ) {
    encoders.forEach((encoder) => {
      this.byId.set(encoder.id, encoder);
    });
  }

  of(id: string): IrEncoder {
    const encoder = this.byId.get(id);
    if (encoder !== undefined) {
      return encoder;
    }
    const family = this.families.find((candidate) => id.startsWith(`${candidate.prefix}:`));
    if (family === undefined) {
      throw new IrEncoderUnknownError(id);
    }
    return family.encoder(id.slice(family.prefix.length + 1));
  }
}
