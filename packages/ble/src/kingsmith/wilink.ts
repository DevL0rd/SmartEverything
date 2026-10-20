import {
  PAD_DISPLAY_FIELDS,
  PAD_GOAL_KINDS,
  PAD_SENSITIVITIES,
  type BeltState,
  type PadDisplayField,
  type PadGoalKind,
  type PadPreferences,
  type PadSensitivity,
  type PanelButton,
  type TreadmillReading,
} from '@smarteverything/domain';
import { WilinkFrameError } from './errors';

export const WILINK_SERVICE = 'fe00';

export const WILINK_NOTIFY = 'fe01';

export const WILINK_WRITE = 'fe02';

const REQUEST_START = 0xf7;

const RESPONSE_START = 0xf8;

const FRAME_END = 0xfd;

const STATUS_TYPE = 0xa2;

const PREFERENCE_TYPE = 0xa6;

const RECORD_TYPE = 0xa7;

const STATUS_BYTES = 20;

const LONGEST_FRAME = 64;

const SPEED_UNIT_KMH = 0.1;

const APP_SPEED_DIVISOR = 30;

const DISTANCE_UNIT_M = 10;

export type WilinkMode = 'auto' | 'manual' | 'standby';

const MODE_CODES: Readonly<Record<WilinkMode, number>> = { auto: 0, manual: 1, standby: 2 };

const MODE_OF_CODE: readonly (TreadmillReading['mode'] & string)[] = ['auto', 'manual', 'standby'];

const GOAL_CODES: Readonly<Record<PadGoalKind, number>> = {
  none: 0,
  distance: 1,
  calories: 2,
  time: 3,
};

const SENSITIVITY_CODES: Readonly<Record<PadSensitivity, number>> = {
  high: 1,
  medium: 2,
  low: 3,
};

const DISPLAY_BITS: Readonly<Record<PadDisplayField, number>> = {
  time: 1,
  speed: 2,
  distance: 4,
  calories: 8,
  steps: 16,
};

const PREFERENCE_KEYS = {
  goal: 1,
  maxSpeed: 3,
  startSpeed: 4,
  autoStart: 5,
  sensitivity: 6,
  childLock: 9,
} as const;

const BUTTONS: Readonly<Record<number, PanelButton>> = { 2: 'up', 3: 'stop', 4: 'down' };

const STATES: Readonly<Record<number, BeltState>> = {
  0: 'idle',
  1: 'running',
  2: 'paused',
  3: 'stopped',
  4: 'fault',
  5: 'standby',
  6: 'countdown',
  7: 'countdown',
  8: 'countdown',
  9: 'countdown',
};

export interface UnknownByte {
  readonly index: number;
  readonly value: number;
}

export interface PadRecord {
  readonly onTime: number;
  readonly startTime: number;
  readonly durationS: number;
  readonly distanceM: number;
  readonly steps: number;
  readonly remaining: number;
}

export type WilinkDecoded =
  | {
      readonly kind: 'status';
      readonly reading: TreadmillReading;
      readonly unknown: readonly UnknownByte[];
    }
  | { readonly kind: 'preferences'; readonly preferences: PadPreferences }
  | { readonly kind: 'record'; readonly record: PadRecord };

export function wilinkChecksum(bytes: ArrayLike<number>, from: number, to: number): number {
  let sum = 0;
  for (let index = from; index < to; index += 1) {
    sum += bytes[index] ?? 0;
  }
  return sum & 0xff;
}

function request(body: readonly number[]): Uint8Array {
  const crc = wilinkChecksum(body, 0, body.length);
  return Uint8Array.from([REQUEST_START, ...body, crc, FRAME_END]);
}

export function statusRequest(): Uint8Array {
  return request([STATUS_TYPE, 0x00, 0x00]);
}

export function setSpeedFrame(kmh: number): Uint8Array {
  return request([STATUS_TYPE, 0x01, Math.round(kmh / SPEED_UNIT_KMH)]);
}

export function setModeFrame(mode: WilinkMode): Uint8Array {
  return request([STATUS_TYPE, 0x02, MODE_CODES[mode]]);
}

export function startFrame(): Uint8Array {
  return request([STATUS_TYPE, 0x04, 0x01]);
}

export function pauseFrame(): Uint8Array {
  return request([STATUS_TYPE, 0x05, 0x01]);
}

export function queryPreferencesFrame(): Uint8Array {
  return request([PREFERENCE_TYPE, 0, 0, 0, 0, 0]);
}

export function queryLatestRecordFrame(): Uint8Array {
  return request([RECORD_TYPE, 0xaa, 0xff]);
}

function preferenceBody(key: number, kind: number, value: number): readonly number[] {
  return [PREFERENCE_TYPE, key, kind, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function goalFrame(kind: PadGoalKind, value: number): Uint8Array {
  return request(preferenceBody(PREFERENCE_KEYS.goal, GOAL_CODES[kind], value));
}

export function speedLimitFrame(which: 'maxSpeed' | 'startSpeed', kmh: number): Uint8Array {
  return request(preferenceBody(PREFERENCE_KEYS[which], 0, Math.round(kmh / SPEED_UNIT_KMH)));
}

export function toggleFrame(which: 'autoStart' | 'childLock', on: boolean): Uint8Array {
  return request(preferenceBody(PREFERENCE_KEYS[which], 0, on ? 1 : 0));
}

export function sensitivityFrame(level: PadSensitivity): Uint8Array {
  return request(preferenceBody(PREFERENCE_KEYS.sensitivity, 0, SENSITIVITY_CODES[level]));
}

function frameAt(buffer: Uint8Array, start: number): number | null {
  const wanted = buffer[start + 1] === STATUS_TYPE ? start + STATUS_BYTES - 1 : null;
  const limit = Math.min(buffer.length, start + LONGEST_FRAME);
  for (let end = start + 3; end < limit; end += 1) {
    const crcIndex = end - 1;
    const closes =
      buffer[end] === FRAME_END &&
      wilinkChecksum(buffer, start + 1, crcIndex) === buffer[crcIndex] &&
      (wanted === null || wanted === end);
    if (closes) {
      return end;
    }
  }
  return null;
}

export interface Split {
  readonly frames: readonly Uint8Array[];
  readonly rest: Uint8Array;
  readonly dropped: number;
}

export function splitWilink(buffer: Uint8Array): Split {
  const frames: Uint8Array[] = [];
  let at = 0;
  let dropped = 0;
  while (at < buffer.length) {
    if (buffer[at] !== RESPONSE_START) {
      dropped += 1;
      at += 1;
      continue;
    }
    const end = frameAt(buffer, at);
    if (end !== null) {
      frames.push(buffer.slice(at, end + 1));
      at = end + 1;
      continue;
    }
    if (buffer.length - at >= STATUS_BYTES) {
      dropped += 1;
      at += 1;
      continue;
    }
    break;
  }
  return { frames, rest: buffer.slice(at), dropped };
}

function uint24(bytes: Uint8Array, index: number): number {
  return ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
}

function unknownBytes(frame: Uint8Array, button: number, state: number): UnknownByte[] {
  const unknown: UnknownByte[] = [];
  for (const index of [15, 17]) {
    const value = frame[index] ?? 0;
    if (value !== 0) {
      unknown.push({ index, value });
    }
  }
  if (button !== 0 && BUTTONS[button] === undefined) {
    unknown.push({ index: 16, value: button });
  }
  if (STATES[state] === undefined) {
    unknown.push({ index: 2, value: state });
  }
  return unknown;
}

function decodeStatus(frame: Uint8Array): WilinkDecoded {
  const state = frame[2] ?? 0;
  const button = frame[16] ?? 0;
  const appSpeed = (frame[14] ?? 0) / APP_SPEED_DIVISOR;
  const knownState = STATES[state];
  const knownButton = BUTTONS[button];
  const mode = MODE_OF_CODE[frame[4] ?? 0];
  return {
    kind: 'status',
    reading: {
      ...(knownState === undefined ? {} : { state: knownState }),
      ...(mode === undefined ? {} : { mode }),
      ...(knownButton === undefined ? {} : { button: knownButton }),
      ...(appSpeed > 0 ? { targetSpeedKmh: appSpeed } : {}),
      speedKmh: (frame[3] ?? 0) * SPEED_UNIT_KMH,
      timeS: uint24(frame, 5),
      distanceM: uint24(frame, 8) * DISTANCE_UNIT_M,
      steps: uint24(frame, 11),
    },
    unknown: unknownBytes(frame, button, state),
  };
}

function displayFieldsOf(mask: number): PadDisplayField[] {
  return PAD_DISPLAY_FIELDS.filter((field) => (mask & DISPLAY_BITS[field]) !== 0);
}

function goalKindOf(code: number): PadGoalKind {
  return PAD_GOAL_KINDS.find((kind) => GOAL_CODES[kind] === code) ?? 'none';
}

function sensitivityOf(code: number): PadSensitivity | undefined {
  return PAD_SENSITIVITIES.find((level) => SENSITIVITY_CODES[level] === code);
}

function decodePreferences(frame: Uint8Array): WilinkDecoded {
  const sensitivity = sensitivityOf(frame[10] ?? 0);
  return {
    kind: 'preferences',
    preferences: {
      goalKind: goalKindOf(frame[2] ?? 0),
      goalValue: uint24(frame, 3),
      maxSpeedKmh: (frame[7] ?? 0) * SPEED_UNIT_KMH,
      startSpeedKmh: (frame[8] ?? 0) * SPEED_UNIT_KMH,
      autoStart: frame[9] === 1,
      ...(sensitivity === undefined ? {} : { sensitivity }),
      displayFields: displayFieldsOf(frame[11] ?? 0),
      childLock: frame[12] === 1,
      units: frame[13] === 1 ? 'mi' : 'km',
    },
  };
}

function decodeRecord(frame: Uint8Array): WilinkDecoded {
  return {
    kind: 'record',
    record: {
      onTime: uint24(frame, 2),
      startTime: uint24(frame, 5),
      durationS: uint24(frame, 8),
      distanceM: uint24(frame, 11) * DISTANCE_UNIT_M,
      steps: uint24(frame, 14),
      remaining: frame[17] ?? 0,
    },
  };
}

export function decodeWilink(frame: Uint8Array): WilinkDecoded {
  const type = frame[1];
  const closed = frame[0] === RESPONSE_START && frame[frame.length - 1] === FRAME_END;
  if (!closed || frame.length < STATUS_BYTES) {
    throw new WilinkFrameError(
      `Expected a WiLink frame of at least ${String(STATUS_BYTES)} bytes between F8 and FD, received ${String(frame.length)} bytes.`,
    );
  }
  if (wilinkChecksum(frame, 1, frame.length - 2) !== frame[frame.length - 2]) {
    throw new WilinkFrameError('The WiLink frame checksum does not match its bytes.');
  }
  if (type === STATUS_TYPE) {
    return decodeStatus(frame);
  }
  if (type === PREFERENCE_TYPE) {
    return decodePreferences(frame);
  }
  if (type === RECORD_TYPE) {
    return decodeRecord(frame);
  }
  throw new WilinkFrameError(
    `Expected a WiLink frame of type A2, A6 or A7, received type ${String(type)}.`,
  );
}
