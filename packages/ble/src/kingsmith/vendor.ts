import type { PadPreferences } from '@smarteverything/domain';
import { VendorFrameError } from './errors';

export const ODM_CHARACTERISTIC = 'd18d2c10-c44c-11e8-a355-529269fb1459';

export const ODM_PREAMBLE = '01000d00060b0f0d';

export const SUPPLEMENT_SERVICE = '24e2521c-f63b-48ed-85be-c5330a00fdf7';

export const SUPPLEMENT_NOTIFY = '24e2521c-f63b-48ed-85be-c5330b00fdf7';

export const SUPPLEMENT_WRITE = '24e2521c-f63b-48ed-85be-c5330d00fdf7';

const UNLOCK_CODE_NAME_CHARACTERS = 4;

const UNLOCK_OFFSET = 1;

const UNLOCK_REPLY = 0x7180;

const SYSTEM_REPLY = 0x7181;

const PROPERTIES_REPLY = 0x7280;

const PROPERTY_PUSH = 0x7250;

const FUNCTION_REPLY = 0x7580;

const EXERCISE_RECORD = 0x7350;

const FAULT_RECORD = 0x7351;

export const SWITCH_BITS = { buzzer: 1 << 1, light: 1 << 3 } as const;

export const PROPERTY_IDS = {
  units: 1,
  autoStop: 2,
  paceDisplay: 3,
  motorVersion: 4,
  errorCode: 5,
  childLock: 6,
  maxSpeed: 7,
  switches: 8,
  mode: 10,
  hardwareMaxSpeed: 11,
  ledColor: 13,
} as const;

const AUTO_STOP_ENABLED_BIT = 0x8000;

const MODE_SHIFT = 5;

const MODE_MASK = 0b111;

const MODE_NAMES: readonly SupplementMode[] = ['manual', 'auto', 'sleep'];

const SPEED_UNIT_KMH = 0.01;

export interface SupplementProperty {
  readonly id: number;
  readonly error: number;
  readonly value: number;
}

export type SupplementDecoded =
  | { readonly kind: 'unlocked' }
  | {
      readonly kind: 'system';
      readonly protocol: number;
      readonly model: number;
      readonly capabilities: number;
    }
  | { readonly kind: 'properties'; readonly properties: readonly SupplementProperty[] }
  | { readonly kind: 'property_push'; readonly properties: readonly SupplementProperty[] }
  | { readonly kind: 'function_bitmap'; readonly hex: string }
  | { readonly kind: 'exercise_record'; readonly hex: string }
  | { readonly kind: 'fault_record'; readonly hex: string };

export type SupplementMode = 'manual' | 'auto' | 'sleep';

export interface SupplementState {
  readonly preferences: PadPreferences;
  readonly motorVersion: number | null;
  readonly errorCode: number | null;
  readonly switches: number | null;
  readonly mode: SupplementMode | null;
}

function checksum(bytes: readonly number[]): number {
  return bytes.reduce((sum, byte) => sum + byte, 0) & 0xff;
}

export function supplementFrame(
  first: number,
  second: number,
  data: readonly number[],
): Uint8Array {
  const body = [first, second, data.length, ...data];
  return Uint8Array.from([...body, checksum(body)]);
}

function le32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
}

export function unlockFrame(name: string): Uint8Array {
  const tail = name.slice(-UNLOCK_CODE_NAME_CHARACTERS);
  let code = 0;
  for (let index = 0; index < tail.length; index += 1) {
    code |= tail.charCodeAt(index) << (8 * index);
  }
  return supplementFrame(0x71, 0x00, [0x01, ...le32((code + UNLOCK_OFFSET) >>> 0)]);
}

export function systemInfoFrame(unixSeconds: number): Uint8Array {
  return supplementFrame(0x71, 0x01, [...le32(unixSeconds), ...le32(0)]);
}

export function settingGetFrame(): Uint8Array {
  return supplementFrame(0x72, 0x00, [0x00]);
}

export function functionInfoFrame(): Uint8Array {
  return supplementFrame(0x75, 0x00, []);
}

export function propertyWriteFrame(id: number, value: number): Uint8Array {
  return supplementFrame(0x72, 0x01, [id, value & 0xff, (value >> 8) & 0xff]);
}

function propertiesOf(data: Uint8Array): SupplementProperty[] {
  const properties: SupplementProperty[] = [];
  for (let at = 0; at + 4 <= data.length; at += 4) {
    properties.push({
      id: data[at] ?? 0,
      error: data[at + 1] ?? 0,
      value: (data[at + 2] ?? 0) | ((data[at + 3] ?? 0) << 8),
    });
  }
  return properties;
}

function readUint32(data: Uint8Array, at: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at, true);
}

interface Payload {
  readonly key: number;
  readonly data: Uint8Array;
}

function payloadOf(frame: Uint8Array): Payload {
  const [first, second, length] = frame;
  if (first === undefined || second === undefined || length === undefined) {
    throw new VendorFrameError(
      `Expected a supplement frame of at least 4 bytes, received ${frame.toHex()}.`,
    );
  }
  const last = frame.length - 1;
  const key = (first << 8) | second;
  const sealed = key !== EXERCISE_RECORD;
  if (
    frame.length !== length + 4 ||
    (sealed && checksum([...frame.subarray(0, last)]) !== frame[last])
  ) {
    throw new VendorFrameError(
      `The supplement frame ${frame.toHex()} has a wrong length or checksum.`,
    );
  }
  return { key, data: frame.subarray(3, last) };
}

export function decodeSupplement(frame: Uint8Array): SupplementDecoded {
  const { key, data } = payloadOf(frame);
  if (key === UNLOCK_REPLY) {
    return { kind: 'unlocked' };
  }
  if (key === SYSTEM_REPLY && data.length >= 8) {
    return {
      kind: 'system',
      protocol: (data[0] ?? 0) | ((data[1] ?? 0) << 8),
      model: (data[2] ?? 0) | ((data[3] ?? 0) << 8),
      capabilities: readUint32(data, 4),
    };
  }
  return decodeOther(key, data);
}

function decodeOther(key: number, data: Uint8Array): SupplementDecoded {
  switch (key) {
    case PROPERTIES_REPLY:
      return { kind: 'properties', properties: propertiesOf(data) };
    case PROPERTY_PUSH:
      return { kind: 'property_push', properties: propertiesOf(data) };
    case FUNCTION_REPLY:
      return { kind: 'function_bitmap', hex: data.toHex() };
    case EXERCISE_RECORD:
      return { kind: 'exercise_record', hex: data.toHex() };
    case FAULT_RECORD:
      return { kind: 'fault_record', hex: data.toHex() };
    default:
      throw new VendorFrameError(
        `Expected a supplement reply 71 80, 71 81, 72 80, 72 50, 73 50, 73 51 or 75 80, received ${key.toString(16)}.`,
      );
  }
}

function applyProperty(state: SupplementState, property: SupplementProperty): SupplementState {
  const { id, value, error } = property;
  if (error !== 0) {
    return state;
  }
  switch (id) {
    case PROPERTY_IDS.units:
      return {
        ...state,
        preferences: { ...state.preferences, units: (value & 1) === 1 ? 'mi' : 'km' },
      };
    case PROPERTY_IDS.autoStop:
      return {
        ...state,
        preferences: {
          ...state.preferences,
          autoStopSeconds:
            (value & AUTO_STOP_ENABLED_BIT) === 0 ? 0 : value & ~AUTO_STOP_ENABLED_BIT,
        },
      };
    case PROPERTY_IDS.paceDisplay:
      return { ...state, preferences: { ...state.preferences, paceDisplay: value !== 0 } };
    case PROPERTY_IDS.motorVersion:
      return { ...state, motorVersion: value };
    case PROPERTY_IDS.errorCode:
      return { ...state, errorCode: value };
    default:
      return applyMore(state, property);
  }
}

function applyMore(state: SupplementState, property: SupplementProperty): SupplementState {
  const { id, value } = property;
  switch (id) {
    case PROPERTY_IDS.childLock:
      return { ...state, preferences: { ...state.preferences, childLock: value !== 0 } };
    case PROPERTY_IDS.maxSpeed:
      return {
        ...state,
        preferences: { ...state.preferences, maxSpeedKmh: value * SPEED_UNIT_KMH },
      };
    case PROPERTY_IDS.switches:
      return {
        ...state,
        switches: value,
        preferences: {
          ...state.preferences,
          buzzer: (value & SWITCH_BITS.buzzer) !== 0,
          light: (value & SWITCH_BITS.light) !== 0,
        },
      };
    case PROPERTY_IDS.mode:
      return { ...state, mode: MODE_NAMES[(value >> MODE_SHIFT) & MODE_MASK] ?? null };
    case PROPERTY_IDS.ledColor:
      return { ...state, preferences: { ...state.preferences, ledColor: value } };
    default:
      return state;
  }
}

export function supplementStateOf(
  properties: readonly SupplementProperty[],
  before: SupplementState,
): SupplementState {
  return properties.reduce(applyProperty, before);
}

export function emptySupplementState(): SupplementState {
  return { preferences: {}, motorVersion: null, errorCode: null, switches: null, mode: null };
}
