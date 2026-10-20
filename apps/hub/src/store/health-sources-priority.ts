import {
  OWN_SOURCE_PREFIX,
  healthSourceRank,
  isOwnSource,
  type HealthRecord,
} from '@smarteverything/domain';

function groupOf(sourceApp: string): string {
  return isOwnSource(sourceApp) ? OWN_SOURCE_PREFIX : sourceApp;
}

function preferredGroup(records: readonly HealthRecord[]): string | null {
  const groups = [...new Set(records.map((record) => groupOf(record.sourceApp)))];
  groups.sort(
    (left, right) => healthSourceRank(left) - healthSourceRank(right) || left.localeCompare(right),
  );
  return groups[0] ?? null;
}

export function fromPreferredSource<T extends HealthRecord>(records: readonly T[]): T[] {
  const group = preferredGroup(records);
  return records.filter((record) => groupOf(record.sourceApp) === group);
}
