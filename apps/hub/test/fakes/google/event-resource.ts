import { listField, objectField, omitFields, stringField, type JsonObject } from './json';
import { apiFailure } from './reply';

export const MAX_REMINDER_OVERRIDES = 5;

export const READ_ONLY_EVENT_FIELDS: readonly string[] = [
  'kind',
  'etag',
  'id',
  'updated',
  'created',
  'htmlLink',
  'creator',
  'organizer',
  'iCalUID',
  'sequence',
  'hangoutLink',
  'recurringEventId',
];

const EVENT_ID_PATTERN = /^[0-9a-v]{5,1024}$/;
const INSTANCE_PATTERN = /^(.+)_(\d{8}(?:T\d{6}Z)?)$/;
const TIMED_SUFFIX = /^\d{8}T\d{6}Z$/;
const DATE_SUFFIX = /^\d{8}$/;

export function validateEventId(id: string): void {
  if (!EVENT_ID_PATTERN.test(id)) {
    throw apiFailure(400, 'Invalid resource id value.', 'invalid');
  }
}

export function serverEventId(sequence: number): string {
  return sequence.toString(32).padStart(26, '0');
}

export function writableFields(body: JsonObject): JsonObject {
  return omitFields(body, READ_ONLY_EVENT_FIELDS);
}

function timeKind(time: JsonObject | undefined): 'date' | 'dateTime' | null {
  if (time === undefined) return null;
  if (typeof time['dateTime'] === 'string') return 'dateTime';
  return typeof time['date'] === 'string' ? 'date' : null;
}

function timeValue(time: JsonObject, kind: 'date' | 'dateTime'): number {
  return Date.parse(stringField(time, kind) ?? '');
}

interface Moment {
  readonly kind: 'date' | 'dateTime';
  readonly ms: number;
}

function momentOf(resource: JsonObject, key: 'start' | 'end'): Moment {
  const time = objectField(resource, key);
  const kind = timeKind(time);
  if (time === undefined || kind === null) {
    throw apiFailure(400, `Missing ${key} time.`, 'required');
  }
  const ms = timeValue(time, kind);
  if (Number.isNaN(ms)) throw apiFailure(400, 'Invalid value for: Invalid format', 'invalid');
  return { kind, ms };
}

function validateTimes(resource: JsonObject): void {
  const start = momentOf(resource, 'start');
  const end = momentOf(resource, 'end');
  if (start.kind !== end.kind) {
    throw apiFailure(
      400,
      'The start and end times must either both be date or both be dateTime.',
      'invalid',
    );
  }
  if (end.ms < start.ms || (start.kind === 'date' && end.ms === start.ms)) {
    throw apiFailure(400, 'The specified time range is empty.', 'timeRangeEmpty');
  }
}

function validateReminders(resource: JsonObject): void {
  const reminders = objectField(resource, 'reminders');
  const overrides = reminders === undefined ? undefined : listField(reminders, 'overrides');
  if (reminders === undefined || overrides === undefined) return;
  if (reminders['useDefault'] === true && overrides.length > 0) {
    throw apiFailure(
      400,
      'Cannot specify both default reminders and overrides at the same time.',
      'cannotUseDefaultRemindersAndSpecifyOverride',
    );
  }
  if (overrides.length > MAX_REMINDER_OVERRIDES) {
    throw apiFailure(400, 'Cannot specify more than 5 override reminders', 'invalid');
  }
}

export function validateEvent(resource: JsonObject): void {
  validateTimes(resource);
  validateReminders(resource);
}

export interface InstanceReference {
  readonly masterId: string;
  readonly suffix: string;
}

export function parseInstanceId(id: string): InstanceReference | null {
  const match = INSTANCE_PATTERN.exec(id);
  const masterId = match?.[1];
  const suffix = match?.[2];
  return masterId === undefined || suffix === undefined ? null : { masterId, suffix };
}

function suffixTime(suffix: string): { kind: 'date' | 'dateTime'; value: string } | null {
  const day = `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`;
  if (TIMED_SUFFIX.test(suffix)) {
    const time = `${suffix.slice(9, 11)}:${suffix.slice(11, 13)}:${suffix.slice(13, 15)}`;
    return { kind: 'dateTime', value: `${day}T${time}Z` };
  }
  return DATE_SUFFIX.test(suffix) ? { kind: 'date', value: day } : null;
}

function shifted(kind: 'date' | 'dateTime', value: string, deltaMs: number): string {
  const moved = new Date(Date.parse(value) + deltaMs).toISOString();
  return kind === 'date' ? moved.slice(0, 10) : moved.replace('.000Z', 'Z');
}

export function buildInstance(
  master: JsonObject,
  id: string,
  suffix: string,
  etag: string,
): JsonObject | null {
  const start = objectField(master, 'start');
  const end = objectField(master, 'end');
  const original = suffixTime(suffix);
  const kind = timeKind(start);
  if (start === undefined || end === undefined || original === null) return null;
  if (kind === null || kind !== original.kind || !Array.isArray(master['recurrence'])) return null;
  const duration = timeValue(end, kind) - timeValue(start, kind);
  const zone = stringField(start, 'timeZone');
  const withZone = (value: string): JsonObject => ({
    [kind]: value,
    ...(zone === undefined ? {} : { timeZone: zone }),
  });
  return {
    ...omitFields(master, ['recurrence', 'etag', 'updated', 'sequence']),
    id,
    etag,
    recurringEventId: stringField(master, 'id'),
    originalStartTime: withZone(original.value),
    start: withZone(original.value),
    end: withZone(shifted(kind, original.value, duration)),
  };
}

export function tombstoneOf(resource: JsonObject, etag: string): JsonObject {
  const base = {
    kind: 'calendar#event',
    etag,
    id: stringField(resource, 'id'),
    status: 'cancelled',
  };
  const recurringEventId = stringField(resource, 'recurringEventId');
  const originalStartTime = objectField(resource, 'originalStartTime');
  if (recurringEventId === undefined || originalStartTime === undefined) return base;
  return { ...base, recurringEventId, originalStartTime };
}
