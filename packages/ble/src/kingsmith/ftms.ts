import type { ControlResult, MachineStatus, TreadmillReading } from '@smarteverything/domain';
import { FtmsFrameError } from './errors';

export const FTMS_SERVICE = '1826';

export const FTMS_FEATURE = '2acc';

export const FTMS_TREADMILL_DATA = '2acd';

export const FTMS_TRAINING_STATUS = '2ad3';

export const FTMS_SPEED_RANGE = '2ad4';

export const FTMS_INCLINE_RANGE = '2ad5';

export const FTMS_CONTROL_POINT = '2ad9';

export const FTMS_MACHINE_STATUS = '2ada';

const SPEED_UNIT_KMH = 0.01;

const INCLINE_UNIT_PERCENT = 0.1;

const ELEVATION_UNIT_M = 0.1;

const MET_UNIT = 0.1;

const NOT_AVAILABLE_16 = 0x7fff;

const NOT_AVAILABLE_ENERGY_16 = 0xffff;

const NOT_AVAILABLE_ENERGY_8 = 0xff;

const FEATURE_NAMES = [
  'average_speed',
  'cadence',
  'total_distance',
  'inclination',
  'elevation_gain',
  'pace',
  'step_count',
  'resistance',
  'stride_count',
  'expended_energy',
  'heart_rate',
  'metabolic_equivalent',
  'elapsed_time',
  'remaining_time',
  'power',
  'force_on_belt',
  'user_data_retention',
] as const;

const TARGET_NAMES = [
  'speed',
  'inclination',
  'resistance',
  'power',
  'heart_rate',
  'energy',
  'steps',
  'strides',
  'distance',
  'time',
  'two_heart_rate_zones',
  'three_heart_rate_zones',
  'five_heart_rate_zones',
  'bike_simulation',
  'wheel_circumference',
  'spin_down',
  'cadence',
] as const;

const TRAINING_STATUS_NAMES = [
  'other',
  'idle',
  'warming_up',
  'low_intensity_interval',
  'high_intensity_interval',
  'recovery_interval',
  'isometric',
  'heart_rate_control',
  'fitness_test',
  'speed_too_low',
  'speed_too_high',
  'cool_down',
  'watt_control',
  'manual',
  'pre_workout',
  'post_workout',
] as const;

const CONTROL_RESULT_CODES: Readonly<Record<number, ControlResult>> = {
  1: 'success',
  2: 'not_supported',
  3: 'invalid_parameter',
  4: 'failed',
  5: 'not_permitted',
};

export interface FtmsFeatures {
  readonly machine: readonly string[];
  readonly targets: readonly string[];
  readonly targetsMirrorMachine: boolean;
}

export interface FtmsRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface ControlResponse {
  readonly opcode: number;
  readonly result: ControlResult;
}

class Cursor {
  private at = 0;

  constructor(private readonly view: DataView) {}

  skip(count: number): void {
    this.at += count;
  }

  private take<T>(width: number, field: string, read: (offset: number) => T): T {
    if (this.at + width > this.view.byteLength) {
      throw new FtmsFrameError(
        `The Treadmill Data frame ended before the ${field} field: needed ${String(this.at + width)} bytes, received ${String(this.view.byteLength)}.`,
      );
    }
    const value = read(this.at);
    this.at += width;
    return value;
  }

  u8(field: string): number {
    return this.take(1, field, (offset) => this.view.getUint8(offset));
  }

  u16(field: string): number {
    return this.take(2, field, (offset) => this.view.getUint16(offset, true));
  }

  s16(field: string): number {
    return this.take(2, field, (offset) => this.view.getInt16(offset, true));
  }

  u24(field: string): number {
    return this.take(
      3,
      field,
      (offset) => this.view.getUint16(offset, true) | (this.view.getUint8(offset + 2) << 16),
    );
  }
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function namesOf(word: number, names: readonly string[]): string[] {
  return names.filter((_, bit) => (word & (1 << bit)) !== 0);
}

export function parseFeatures(bytes: Uint8Array): FtmsFeatures {
  if (bytes.length < 8) {
    throw new FtmsFrameError(
      `Expected 8 bytes of Fitness Machine Feature, received ${String(bytes.length)}.`,
    );
  }
  const view = viewOf(bytes);
  const machine = view.getUint32(0, true);
  const targets = view.getUint32(4, true);
  return {
    machine: namesOf(machine, FEATURE_NAMES),
    targets: namesOf(targets, TARGET_NAMES),
    targetsMirrorMachine: machine === targets,
  };
}

export function parseSpeedRange(bytes: Uint8Array): FtmsRange {
  if (bytes.length < 6) {
    throw new FtmsFrameError(
      `Expected 6 bytes of Supported Speed Range, received ${String(bytes.length)}.`,
    );
  }
  const view = viewOf(bytes);
  return {
    min: view.getUint16(0, true) * SPEED_UNIT_KMH,
    max: view.getUint16(2, true) * SPEED_UNIT_KMH,
    step: view.getUint16(4, true) * SPEED_UNIT_KMH,
  };
}

export function parseInclineRange(bytes: Uint8Array): FtmsRange {
  if (bytes.length < 6) {
    throw new FtmsFrameError(
      `Expected 6 bytes of Supported Inclination Range, received ${String(bytes.length)}.`,
    );
  }
  const view = viewOf(bytes);
  return {
    min: view.getInt16(0, true) * INCLINE_UNIT_PERCENT,
    max: view.getInt16(2, true) * INCLINE_UNIT_PERCENT,
    step: view.getUint16(4, true) * INCLINE_UNIT_PERCENT,
  };
}

function present(flags: number, bit: number): boolean {
  return (flags & (1 << bit)) !== 0;
}

function energyOf(cursor: Cursor): TreadmillReading {
  const total = cursor.u16('total energy');
  const perHour = cursor.u16('energy per hour');
  const perMinute = cursor.u8('energy per minute');
  return {
    ...(total === NOT_AVAILABLE_ENERGY_16 ? {} : { energyKcal: total }),
    ...(perHour === NOT_AVAILABLE_ENERGY_16 ? {} : { energyKcalPerHour: perHour }),
    ...(perMinute === NOT_AVAILABLE_ENERGY_8 ? {} : { energyKcalPerMinute: perMinute }),
  };
}

function inclinationOf(cursor: Cursor): TreadmillReading {
  const incline = cursor.s16('inclination');
  cursor.skip(2);
  return incline === NOT_AVAILABLE_16 ? {} : { inclinePercent: incline * INCLINE_UNIT_PERCENT };
}

function elevationOf(cursor: Cursor): TreadmillReading {
  const gain = cursor.u16('positive elevation gain');
  cursor.skip(2);
  return { elevationGainM: gain * ELEVATION_UNIT_M };
}

function leadingFields(flags: number, cursor: Cursor): TreadmillReading {
  return {
    ...(present(flags, 0) ? {} : { speedKmh: cursor.u16('instantaneous speed') * SPEED_UNIT_KMH }),
    ...(present(flags, 1) ? { averageSpeedKmh: cursor.u16('average speed') * SPEED_UNIT_KMH } : {}),
    ...(present(flags, 2) ? { distanceM: cursor.u24('total distance') } : {}),
    ...(present(flags, 3) ? inclinationOf(cursor) : {}),
    ...(present(flags, 4) ? elevationOf(cursor) : {}),
  };
}

function trailingFields(flags: number, cursor: Cursor): TreadmillReading {
  if (present(flags, 5)) {
    cursor.skip(1);
  }
  if (present(flags, 6)) {
    cursor.skip(1);
  }
  const energy = present(flags, 7) ? energyOf(cursor) : {};
  const heartRate = present(flags, 8) ? cursor.u8('heart rate') : 0;
  const met = present(flags, 9) ? cursor.u8('metabolic equivalent') : 0;
  return {
    ...energy,
    ...(present(flags, 8) ? { heartRate } : {}),
    ...(met > 0 ? { met: met * MET_UNIT } : {}),
    ...(present(flags, 10) ? { timeS: cursor.u16('elapsed time') } : {}),
    ...(present(flags, 11) ? { remainingS: cursor.u16('remaining time') } : {}),
  };
}

export function parseTreadmillData(bytes: Uint8Array): TreadmillReading {
  const cursor = new Cursor(viewOf(bytes));
  const flags = cursor.u16('flags');
  const leading = leadingFields(flags, cursor);
  const trailing = trailingFields(flags, cursor);
  if (present(flags, 12)) {
    cursor.skip(4);
  }
  const steps = present(flags, 13) ? { steps: cursor.u16('step count') } : {};
  return { ...leading, ...trailing, ...steps };
}

export function parseMachineStatus(bytes: Uint8Array): MachineStatus {
  const view = viewOf(bytes);
  const opcode = bytes[0];
  if (opcode === undefined) {
    throw new FtmsFrameError('Expected a Fitness Machine Status opcode, received no bytes.');
  }
  switch (opcode) {
    case 0x01:
      return { kind: 'reset' };
    case 0x02:
      return bytes[1] === 2 ? { kind: 'paused' } : { kind: 'stopped' };
    case 0x03:
      return { kind: 'safety_stop' };
    case 0x04:
      return { kind: 'started' };
    case 0x05:
    case 0x06:
      return targetStatus(opcode, bytes, view);
    case 0xff:
      return { kind: 'control_lost' };
    default:
      return { kind: 'other', opcode };
  }
}

function targetStatus(opcode: number, bytes: Uint8Array, view: DataView): MachineStatus {
  const speed = opcode === 0x05;
  if (bytes.length < 3) {
    throw new FtmsFrameError(
      speed
        ? 'The target speed status needs a 16-bit speed.'
        : 'The target inclination status needs a 16-bit inclination.',
    );
  }
  return speed
    ? { kind: 'target_speed', kmh: view.getUint16(1, true) * SPEED_UNIT_KMH }
    : { kind: 'target_incline', percent: view.getInt16(1, true) * INCLINE_UNIT_PERCENT };
}

export function parseControlResponse(bytes: Uint8Array): ControlResponse {
  const [marker, opcode, code] = bytes;
  const result = code === undefined ? undefined : CONTROL_RESULT_CODES[code];
  if (marker !== 0x80 || opcode === undefined || result === undefined) {
    throw new FtmsFrameError(
      `Expected a Control Point response 80 <opcode> <result 1 to 5>, received ${bytes.toHex()}.`,
    );
  }
  return { opcode, result };
}

export function parseTrainingStatus(bytes: Uint8Array): string {
  const code = bytes[1];
  const name = code === undefined ? undefined : TRAINING_STATUS_NAMES[code];
  if (name === undefined) {
    throw new FtmsFrameError(
      `Expected a Training Status code from 0 to 15, received ${bytes.toHex()}.`,
    );
  }
  return name;
}

export function requestControl(): Uint8Array {
  return Uint8Array.of(0x00);
}

export function resetMachine(): Uint8Array {
  return Uint8Array.of(0x01);
}

export function targetSpeed(kmh: number): Uint8Array {
  const raw = Math.round(kmh / SPEED_UNIT_KMH);
  return Uint8Array.of(0x02, raw & 0xff, (raw >> 8) & 0xff);
}

export function targetInclination(percent: number): Uint8Array {
  const raw = Math.round(percent / INCLINE_UNIT_PERCENT);
  return Uint8Array.of(0x03, raw & 0xff, (raw >> 8) & 0xff);
}

export function startOrResume(): Uint8Array {
  return Uint8Array.of(0x07);
}

export function stopMachine(): Uint8Array {
  return Uint8Array.of(0x08, 0x01);
}

export function pauseMachine(): Uint8Array {
  return Uint8Array.of(0x08, 0x02);
}
