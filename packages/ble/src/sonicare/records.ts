import { uint16, uint32 } from '../bytes';

export const RECORD_ROUTINE_KIND = 0;

export const RECORD_START = 0;

export const RECORD_CANCEL = 2;

export const RECORD_COMPLETE = 0;

export const RECORD_PARTIAL = 1;

export const KIDS_READ_LENGTH = 16;

const MODE_OFFSET = 10;

const INTENSITY_OFFSET = 11;

const ROUTINE_ID_OFFSET = 12;

const MAX_ROUTINE_SECONDS = 3600;

const MAX_DURATION_FACTOR = 2;

const UNIX_CLOCK_FLOOR = 1_577_836_800;

export interface StoredRecord {
  readonly handleClock: number;
  readonly sessionId: number;
  readonly durationS: number;
  readonly routineS: number;
  readonly modePosition: number;
  readonly intensity: number;
  readonly routineId: number | null;
}

export type RecordForm = 'notified' | 'read';

function plausible(durationS: number, routineS: number): boolean {
  return (
    routineS > 0 && routineS <= MAX_ROUTINE_SECONDS && durationS <= routineS * MAX_DURATION_FACTOR
  );
}

function fitsForm(length: number, form: RecordForm): boolean {
  return form === 'notified' ? length > 1 + INTENSITY_OFFSET : length === KIDS_READ_LENGTH;
}

export function decodeStoredRecord(bytes: Uint8Array, form: RecordForm): StoredRecord | null {
  const base = form === 'notified' ? 1 : 0;
  if (!fitsForm(bytes.length, form)) {
    return null;
  }
  const routineS = uint16(bytes, base + 8);
  const durationS = uint16(bytes, base + 6);
  if (!plausible(durationS, routineS)) {
    return null;
  }
  const hasRoutineId = bytes.length > base + ROUTINE_ID_OFFSET;
  return {
    handleClock: uint32(bytes, base),
    sessionId: uint16(bytes, base + 4),
    durationS,
    routineS,
    modePosition: bytes[base + MODE_OFFSET] ?? 0,
    intensity: bytes[base + INTENSITY_OFFSET] ?? 0,
    routineId: hasRoutineId ? (bytes[base + ROUTINE_ID_OFFSET] ?? null) : null,
  };
}

export function clockIsUnix(handleClock: number): boolean {
  return handleClock >= UNIX_CLOCK_FLOOR;
}

export function recordStart(
  record: Pick<StoredRecord, 'handleClock'>,
  nowClock: number,
  now: Date,
): Date {
  if (clockIsUnix(record.handleClock)) {
    return new Date(record.handleClock * 1000);
  }
  return new Date(now.getTime() - (nowClock - record.handleClock) * 1000);
}
