import { bytesToHex, uint16, uint32, uint8 } from '../bytes';
import { UnsupportedOralbProtocol, requireAtLeast } from './errors';

export const ORALB_SESSION_RECORD_LENGTH = 21;

const HEADER_LENGTH = 8;

const METADATA_MAGIC = 0xff;

const METADATA_LENGTH = 12;

const MODEL_CODES: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6, 16, 17]);

const LAST_COLOUR = 16;

const LAST_LANGUAGE = 10;

const BATTERY_UNKNOWN = 0xff;

const LOW13 = 0x1fff;

const HIGH3_SHIFT = 13;

const DECISECOND_MS = 100;

const HECTO_NEWTON_MN = 100;

const SESSION_PROTOCOLS: readonly number[] = [7, 8, 9];

const HEADER_PROTOCOL = 6;

export interface OralbRecordHeader {
  readonly startClock: number;
  readonly sessionId: number;
  readonly userId: number;
  readonly targetS: number;
  readonly sectorCount: number;
}

export interface OralbSessionRecord extends OralbRecordHeader {
  readonly kind: 'session';
  readonly protocol: number;
  readonly durationS: number;
  readonly highPressureMs: number;
  readonly lowPressureMs: number;
  readonly averageForceMn: number;
  readonly maximumForceMn: number;
  readonly highPressureEvents: number;
  readonly lowPressureEvents: number;
  readonly powerOnEvents: number;
  readonly modeId: number;
  readonly batteryEnd: number | null;
}

export interface OralbHeaderRecord extends OralbRecordHeader {
  readonly kind: 'header';
  readonly protocol: number;
  readonly bodyHex: string;
}

export interface OralbMetadataRecord {
  readonly kind: 'metadata';
  readonly model: number;
  readonly colour: number;
  readonly language: number;
  readonly modeSlots: readonly number[];
  readonly gumGuard: number | null;
}

export type OralbRecord = OralbSessionRecord | OralbHeaderRecord | OralbMetadataRecord;

export function isOralbMetadata(bytes: Uint8Array): boolean {
  return (
    bytes.length >= METADATA_LENGTH &&
    uint8(bytes, 0) === METADATA_MAGIC &&
    MODEL_CODES.has(uint8(bytes, 1)) &&
    uint8(bytes, 2) <= LAST_COLOUR &&
    uint8(bytes, 3) <= LAST_LANGUAGE
  );
}

function metadataOf(bytes: Uint8Array): OralbMetadataRecord {
  return {
    kind: 'metadata',
    model: uint8(bytes, 1),
    colour: uint8(bytes, 2),
    language: uint8(bytes, 3),
    modeSlots: [...bytes.subarray(4, 12)],
    gumGuard: bytes.length > METADATA_LENGTH ? uint8(bytes, 12) : null,
  };
}

function headerOf(bytes: Uint8Array): OralbRecordHeader {
  const identity = uint16(bytes, 4);
  const target = uint16(bytes, 6);
  return {
    startClock: uint32(bytes, 0),
    sessionId: identity & LOW13,
    userId: identity >> HIGH3_SHIFT,
    targetS: target & LOW13,
    sectorCount: target >> HIGH3_SHIFT,
  };
}

export function decodeOralbRecord(bytes: Uint8Array, protocol: number): OralbRecord {
  if (!SESSION_PROTOCOLS.includes(protocol) && protocol !== HEADER_PROTOCOL) {
    throw new UnsupportedOralbProtocol(protocol);
  }
  if (isOralbMetadata(bytes)) {
    return metadataOf(bytes);
  }
  if (protocol === HEADER_PROTOCOL) {
    requireAtLeast('FF29', bytes, HEADER_LENGTH);
    return {
      kind: 'header',
      protocol,
      ...headerOf(bytes),
      bodyHex: bytesToHex(bytes.subarray(HEADER_LENGTH)),
    };
  }
  requireAtLeast('FF29', bytes, ORALB_SESSION_RECORD_LENGTH);
  const battery = uint8(bytes, 20);
  return {
    kind: 'session',
    protocol,
    ...headerOf(bytes),
    durationS: uint16(bytes, 8),
    highPressureMs: uint16(bytes, 10) * DECISECOND_MS,
    lowPressureMs: uint16(bytes, 12) * DECISECOND_MS,
    averageForceMn: uint8(bytes, 14) * HECTO_NEWTON_MN,
    maximumForceMn: uint8(bytes, 15) * HECTO_NEWTON_MN,
    highPressureEvents: uint8(bytes, 16),
    lowPressureEvents: uint8(bytes, 17),
    powerOnEvents: uint8(bytes, 18),
    modeId: uint8(bytes, 19),
    batteryEnd: battery === BATTERY_UNKNOWN ? null : battery,
  };
}

export function recordWallTime(recordStart: number, clockRead: number, readAtMs: number): number {
  return readAtMs - (clockRead - recordStart) * 1000;
}
