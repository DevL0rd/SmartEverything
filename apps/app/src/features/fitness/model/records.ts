import type { HealthRecord, HealthRecordType } from '@smarteverything/domain';

export type RecordOf<T extends HealthRecordType> = Extract<HealthRecord, { readonly type: T }>;

export function recordsOfType<T extends HealthRecordType>(
  records: readonly HealthRecord[],
  type: T,
): RecordOf<T>[] {
  return records.filter((record): record is RecordOf<T> => record.type === type);
}

export function startOf(record: HealthRecord): number {
  return Date.parse(record.startTime);
}

export function endOf(record: HealthRecord): number {
  return record.endTime === null ? Date.parse(record.startTime) : Date.parse(record.endTime);
}

export function overlapping<T extends HealthRecord>(
  records: readonly T[],
  from: number,
  to: number,
): T[] {
  return records.filter((record) => {
    const start = startOf(record);
    const end = endOf(record);
    return end > start ? start < to && end > from : start >= from && start < to;
  });
}

export function newestFirst<T extends HealthRecord>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => startOf(right) - startOf(left));
}
