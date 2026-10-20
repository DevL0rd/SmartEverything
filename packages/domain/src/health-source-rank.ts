import type { HealthRecord, HealthRecordType } from './health';
import { isOwnSource } from './health-entries';
import { WATCH_SOURCE_APP } from './watches';

const WEARABLE_APPS: readonly string[] = [
  'nodomain.freeyourgadget.gadgetbridge',
  'com.xiaomi.wearable',
  'com.mi.health',
  'com.fitbit.FitbitMobile',
  'com.garmin.android.apps.connectmobile',
  'com.huawei.health',
  'com.samsung.android.wear.shealth',
];

const PHONE_SENSOR_PREFIXES: readonly string[] = ['com.android.healthconnect.phone', 'android'];

const OTHER_RANK = 100;

const PHONE_RANK = 1000;

const HOUR_MS = 3_600_000;

export const HOURLY_RANKED_TYPES: ReadonlySet<HealthRecordType> = new Set<HealthRecordType>([
  'Steps',
  'Distance',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
]);

export function healthSourceRank(sourceApp: string): number {
  if (sourceApp === WATCH_SOURCE_APP) {
    return 0;
  }
  if (isOwnSource(sourceApp)) {
    return 1;
  }
  const wearable = WEARABLE_APPS.indexOf(sourceApp);
  if (wearable >= 0) {
    return 2 + wearable;
  }
  const phone = PHONE_SENSOR_PREFIXES.some(
    (prefix) => sourceApp === prefix || sourceApp.startsWith(`${prefix}.`),
  );
  return phone ? PHONE_RANK : OTHER_RANK;
}

export interface CountedRecord<T extends HealthRecord> {
  readonly record: T;
  readonly share: number;
}

interface HourPiece {
  readonly key: string;
  readonly fraction: number;
}

function hourPieces(record: HealthRecord): HourPiece[] {
  const start = Date.parse(record.startTime);
  const end = record.endTime === null ? start : Date.parse(record.endTime);
  const first = Math.floor(start / HOUR_MS);
  if (end <= start) {
    return [{ key: `${record.type}:${String(first)}`, fraction: 1 }];
  }
  const pieces: HourPiece[] = [];
  for (let hour = first; hour * HOUR_MS < end; hour += 1) {
    const overlap = Math.min(end, (hour + 1) * HOUR_MS) - Math.max(start, hour * HOUR_MS);
    pieces.push({ key: `${record.type}:${String(hour)}`, fraction: overlap / (end - start) });
  }
  return pieces;
}

function bestRanks(records: readonly HealthRecord[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const record of records) {
    const rank = healthSourceRank(record.sourceApp);
    for (const piece of hourPieces(record)) {
      best.set(piece.key, Math.min(rank, best.get(piece.key) ?? rank));
    }
  }
  return best;
}

export function preferredShares<T extends HealthRecord>(records: readonly T[]): CountedRecord<T>[] {
  const ranked = records.filter((record) => HOURLY_RANKED_TYPES.has(record.type));
  const best = bestRanks(ranked);
  return records.flatMap((record) => {
    if (!HOURLY_RANKED_TYPES.has(record.type)) {
      return [{ record, share: 1 }];
    }
    const rank = healthSourceRank(record.sourceApp);
    const share = hourPieces(record)
      .filter((piece) => best.get(piece.key) === rank)
      .reduce((total, piece) => total + piece.fraction, 0);
    return share > 0 ? [{ record, share }] : [];
  });
}
