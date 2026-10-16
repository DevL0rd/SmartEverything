import type { Snapshot } from '@smarteverything/domain';
import type { NextTable, Tables } from './state';

export function automationTablesOf(
  snapshot: Snapshot,
  next: NextTable,
): Pick<Tables, 'automation_values' | 'automation_runs' | 'automation_sequences'> {
  return {
    automation_values: next('automation_values', snapshot.tables.automation_values ?? []),
    automation_sequences: next('automation_sequences', snapshot.tables.automation_sequences ?? []),
    automation_runs: next('automation_runs', snapshot.tables.automation_runs ?? []),
  };
}
