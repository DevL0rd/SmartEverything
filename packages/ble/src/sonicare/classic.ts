import { headTypeOf } from '@smarteverything/domain';
import { bytesToHex, uint16, uint32 } from '../bytes';
import {
  BRUSHING_STATES,
  HANDLE_STATES,
  type BrushDelta,
  type BrushingStateName,
  type HandleStateName,
} from './delta';
import { SonicareFrameError } from './errors';
import { decodeSensorFrame } from './sensor';
import { KEY, shortOf } from './uuids';

type Decoder = (bytes: Uint8Array, name: string) => BrushDelta;

const DECODER = new TextDecoder();

function need(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.length < length) {
    throw new SonicareFrameError(name, `at least ${String(length)} bytes`, bytesToHex(bytes));
  }
}

function textOf(bytes: Uint8Array): string {
  return DECODER.decode(bytes).replaceAll('\0', '').trim();
}

function byteOf(bytes: Uint8Array, name: string): number {
  need(bytes, 1, name);
  return bytes[0] ?? 0;
}

function word(bytes: Uint8Array, name: string): number {
  need(bytes, 2, name);
  return uint16(bytes, 0);
}

function long(bytes: Uint8Array, name: string): number {
  need(bytes, 4, name);
  return uint32(bytes, 0);
}

function paddedLong(bytes: Uint8Array, name: string): number {
  need(bytes, 2, name);
  const padded = new Uint8Array(4);
  padded.set(bytes.subarray(0, 4));
  return uint32(padded, 0);
}

function handleStateOf(code: number): HandleStateName | null {
  return HANDLE_STATES[code] ?? null;
}

function brushingStateOf(code: number): BrushingStateName | null {
  return BRUSHING_STATES[code] ?? null;
}

function serialOf(bytes: Uint8Array): string | null {
  if (bytes.every((byte) => byte === 0)) {
    return null;
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

function transferOf(bytes: Uint8Array, name: string): BrushDelta {
  need(bytes, 6, name);
  return { transfer: { sessionId: uint16(bytes, 0), length: uint32(bytes, 2) } };
}

function calibrationWordsOf(bytes: Uint8Array, name: string): BrushDelta {
  need(bytes, 2, name);
  const count = Math.floor(bytes.length / 2);
  return {
    calibrationWords: Array.from({ length: count }, (_, index) => uint16(bytes, index * 2)),
  };
}

function modeOf(bytes: Uint8Array, name: string): BrushDelta {
  return { modePosition: bytes.length >= 2 ? word(bytes, name) : byteOf(bytes, name) };
}

function routinesOf(bytes: Uint8Array, name: string): BrushDelta {
  need(bytes, 1, name);
  const ids = [...bytes];
  return bytes.length === 1 ? { routineIds: ids, modeRoutineId: ids[0] ?? 0 } : { routineIds: ids };
}

function byteField(key: keyof BrushDelta): Decoder {
  return (bytes, name): BrushDelta => ({ [key]: byteOf(bytes, name) });
}

function wordField(key: keyof BrushDelta): Decoder {
  return (bytes, name): BrushDelta => ({ [key]: word(bytes, name) });
}

function longField(key: keyof BrushDelta): Decoder {
  return (bytes, name): BrushDelta => ({ [key]: long(bytes, name) });
}

function textField(key: keyof BrushDelta): Decoder {
  return (bytes): BrushDelta => ({ [key]: textOf(bytes) });
}

const handleStateDecoder: Decoder = (bytes, name): BrushDelta => ({
  handleState: handleStateOf(byteOf(bytes, name)),
});

const brushingStateDecoder: Decoder = (bytes, name): BrushDelta => ({
  brushingState: brushingStateOf(byteOf(bytes, name)),
});

const headTypeDecoder: Decoder = (bytes, name): BrushDelta => ({
  headType: headTypeOf(byteOf(bytes, name)),
});

const settingsDecoder: Decoder = (bytes, name): BrushDelta => ({
  settingsBits: paddedLong(bytes, name),
});

const calibrationTextDecoder: Decoder = (bytes): BrushDelta => ({
  calibration: textOf(bytes)
    .split(/[\r\n]+/)
    .filter((line) => line !== ''),
});

const DECODERS: ReadonlyMap<string, Decoder> = new Map<string, Decoder>([
  [KEY.battery, byteField('battery')],
  [KEY.model, textField('model')],
  [KEY.serial, textField('serial')],
  [KEY.firmware, textField('firmware')],
  [KEY.manufacturer, textField('manufacturer')],
  [KEY.pnp, (bytes): BrushDelta => ({ pnp: bytesToHex(bytes) })],
  [KEY.handleState, handleStateDecoder],
  [KEY.availableRoutines, wordField('availableRoutines')],
  [KEY.routineIds, routinesOf],
  [KEY.motorRuntime, longField('motorSeconds')],
  [KEY.handleClock, longField('handleClock')],
  [KEY.sessionId, wordField('sessionId')],
  [KEY.mode, modeOf],
  [KEY.brushingState, brushingStateDecoder],
  [KEY.elapsed, wordField('elapsedS')],
  [KEY.routineLength, wordField('routineS')],
  [KEY.pacer, byteField('pacer')],
  [KEY.intensity, byteField('intensity')],
  [KEY.easyStart, byteField('easyStart')],
  [KEY.latestStored, wordField('latestStoredId')],
  [KEY.storedCount, wordField('storedCount')],
  [KEY.fetchSession, transferOf],
  [KEY.recordData, (bytes): BrushDelta => ({ recordChunk: bytes.slice() })],
  [KEY.recordControl, byteField('recordStatus')],
  [KEY.sensorEnable, wordField('sensorMask')],
  [KEY.sensorData, (bytes): BrushDelta => decodeSensorFrame(bytes)],
  [KEY.headNfcVersion, (bytes): BrushDelta => ({ nfcVersion: [...bytes].join('.') })],
  [KEY.headType, headTypeDecoder],
  [KEY.headSerial, (bytes): BrushDelta => ({ headSerial: serialOf(bytes) })],
  [KEY.headMade, textField('headMade')],
  [KEY.headLimit, wordField('headLimitS')],
  [KEY.headUsage, wordField('headUsageS')],
  [KEY.headUrl, textField('nfcUrl')],
  [KEY.headRing, wordField('headRing')],
  [KEY.errorPersistent, longField('errorPersistent')],
  [KEY.errorVolatile, longField('errorVolatile')],
  [KEY.calibrationWords, calibrationWordsOf],
  [KEY.batteryMillivolts, longField('batteryMillivolts')],
  [KEY.calibrationText, calibrationTextDecoder],
  [KEY.settings, settingsDecoder],
]);

export function decodeClassic(characteristic: string, bytes: Uint8Array): BrushDelta {
  const key = shortOf(characteristic);
  const decoder = DECODERS.get(key);
  return decoder === undefined ? {} : decoder(bytes, key);
}

export const SETTING_BITS = {
  pressure: 0x0200,
  scrubbing: 0x0800,
  adaptive: 0x1000,
} as const;

export interface SettingFlags {
  readonly pressure: boolean;
  readonly scrubbing: boolean;
  readonly adaptive: boolean;
}

export function settingFlags(bits: number): SettingFlags {
  return {
    pressure: (bits & SETTING_BITS.pressure) !== 0,
    scrubbing: (bits & SETTING_BITS.scrubbing) !== 0,
    adaptive: (bits & SETTING_BITS.adaptive) !== 0,
  };
}

export function withSetting(bits: number, flag: keyof typeof SETTING_BITS, on: boolean): number {
  const mask = SETTING_BITS[flag];
  return (on ? bits | mask : bits & ~mask) >>> 0;
}
