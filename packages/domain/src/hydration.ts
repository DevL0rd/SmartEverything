import type { HealthRecord } from './health';

type HydrationRecord = Extract<HealthRecord, { type: 'Hydration' }>;

export function hydrationAmounts(records: readonly HealthRecord[]): number[] {
  const distinct = new Map<string, HydrationRecord>();
  for (const record of records) {
    if (record.type !== 'Hydration') {
      continue;
    }
    const previous = distinct.get(record.recordId);
    if (
      previous === undefined ||
      Date.parse(record.lastModified) > Date.parse(previous.lastModified)
    ) {
      distinct.set(record.recordId, record);
    }
  }
  return [...distinct.values()].map((record) => record.data.liters);
}
