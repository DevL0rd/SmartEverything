import type { HealthRecord } from '@smarteverything/domain';

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;

const MAX_STEPS_PER_MINUTE = 200;
const MAX_METERS_PER_MINUTE = 400;
const MAX_KILOCALORIES_PER_MINUTE = 30;
const HEART_RATE_BPM = { min: 25, max: 240 } as const;
const RESTING_HEART_RATE_BPM = { min: 25, max: 200 } as const;
const OXYGEN_SATURATION_PERCENT = { min: 70, max: 100 } as const;
const MAX_AGGREGATE_MINUTES = 2 * HOUR_MINUTES;
const MAX_SESSION_MINUTES = 24 * HOUR_MINUTES;
const MAX_FUTURE_MINUTES = 10;

interface Range {
  readonly min: number;
  readonly max: number;
}

interface Implausibility {
  readonly recordId: string;
  readonly recordType: string;
  readonly field: string;
  readonly value: number;
  readonly limit: string;
}

class ImplausibleWatchRecord extends Error {
  override readonly name = 'ImplausibleWatchRecord';

  constructor(readonly detail: Implausibility) {
    super(
      `Watch record ${detail.recordId} (${detail.recordType}) has ${detail.field} ${String(detail.value)}, outside ${detail.limit}.`,
    );
  }
}

export interface ScreenedRecords {
  readonly accepted: readonly HealthRecord[];
  readonly rejected: readonly ImplausibleWatchRecord[];
  readonly dropped: number;
}

const FILE_KEY = /^watch:[^:]+:([^:]+):/;

function fileOf(record: HealthRecord): string {
  return FILE_KEY.exec(record.recordId)?.[1] ?? record.recordId;
}

function failure(
  record: HealthRecord,
  field: string,
  value: number,
  limit: string,
): ImplausibleWatchRecord {
  return new ImplausibleWatchRecord({
    recordId: record.recordId,
    recordType: record.type,
    field,
    value,
    limit,
  });
}

function spanMinutes(record: HealthRecord): number {
  return record.endTime === null
    ? 0
    : (Date.parse(record.endTime) - Date.parse(record.startTime)) / MINUTE_MS;
}

function rateFailure(
  record: HealthRecord,
  field: string,
  value: number,
  perMinute: number,
): ImplausibleWatchRecord | null {
  const limit = perMinute * Math.max(1, spanMinutes(record));
  return value > limit
    ? failure(record, field, value, `${String(limit)} (${String(perMinute)} per minute)`)
    : null;
}

function rangeFailure(
  record: HealthRecord,
  field: string,
  value: number,
  range: Range,
): ImplausibleWatchRecord | null {
  return value < range.min || value > range.max
    ? failure(record, field, value, `${String(range.min)} to ${String(range.max)}`)
    : null;
}

function timingFailure(record: HealthRecord, now: Date): ImplausibleWatchRecord | null {
  const end = Date.parse(record.endTime ?? record.startTime);
  const ahead = (end - now.getTime()) / MINUTE_MS;
  if (ahead > MAX_FUTURE_MINUTES) {
    return failure(record, 'minutes after now', ahead, String(MAX_FUTURE_MINUTES));
  }
  const session = record.type === 'SleepSession' || record.type === 'ExerciseSession';
  const limit = session ? MAX_SESSION_MINUTES : MAX_AGGREGATE_MINUTES;
  const span = spanMinutes(record);
  return span > limit ? failure(record, 'minutes long', span, String(limit)) : null;
}

function dataFailure(record: HealthRecord): ImplausibleWatchRecord | null {
  if (record.type === 'Steps') {
    return rateFailure(record, 'steps', record.data.count, MAX_STEPS_PER_MINUTE);
  }
  if (record.type === 'Distance') {
    return rateFailure(record, 'meters', record.data.meters, MAX_METERS_PER_MINUTE);
  }
  if (record.type === 'ActiveCaloriesBurned') {
    return rateFailure(
      record,
      'kilocalories',
      record.data.kilocalories,
      MAX_KILOCALORIES_PER_MINUTE,
    );
  }
  if (record.type === 'HeartRate') {
    return (
      record.data.samples
        .map((sample) => rangeFailure(record, 'bpm', sample.bpm, HEART_RATE_BPM))
        .find((found) => found !== null) ?? null
    );
  }
  if (record.type === 'RestingHeartRate') {
    return rangeFailure(record, 'bpm', record.data.bpm, RESTING_HEART_RATE_BPM);
  }
  if (record.type === 'OxygenSaturation') {
    return rangeFailure(record, 'percent', record.data.percent, OXYGEN_SATURATION_PERCENT);
  }
  return null;
}

function implausibility(record: HealthRecord, now: Date): ImplausibleWatchRecord | null {
  return timingFailure(record, now) ?? dataFailure(record);
}

export function screenWatchRecords(records: readonly HealthRecord[], now: Date): ScreenedRecords {
  const byFile = new Map<string, ImplausibleWatchRecord>();
  for (const record of records) {
    const found = implausibility(record, now);
    if (found !== null && !byFile.has(fileOf(record))) {
      byFile.set(fileOf(record), found);
    }
  }
  const accepted = records.filter((record) => !byFile.has(fileOf(record)));
  return { accepted, rejected: [...byFile.values()], dropped: records.length - accepted.length };
}
