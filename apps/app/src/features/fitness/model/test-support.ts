import { HEALTH_RECORD, type HealthRecord } from '@smarteverything/domain';

export interface RecordSeed {
  readonly type: string;
  readonly start: Date;
  readonly end?: Date;
  readonly data: unknown;
  readonly id?: string;
  readonly source?: string;
}

let counter = 0;

export function seedRecord(seed: RecordSeed): HealthRecord {
  counter += 1;
  return HEALTH_RECORD.parse({
    recordId: seed.id ?? `record-${String(counter)}`,
    type: seed.type,
    startTime: seed.start.toISOString(),
    endTime: seed.end === undefined ? null : seed.end.toISOString(),
    zoneOffsetSeconds: 0,
    sourceApp: seed.source ?? 'com.mi.health',
    lastModified: seed.start.toISOString(),
    data: seed.data,
  });
}

export function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}
