import type { Snapshot } from '@smarteverything/domain';
import type { NextTable, Tables } from './state';

export function automationTablesOf(
  snapshot: Snapshot,
  next: NextTable,
): Pick<Tables, 'automation_values' | 'automation_runs' | 'automation_plugin_kinds'> {
  return {
    automation_plugin_kinds: next(
      'automation_plugin_kinds',
      snapshot.tables.automation_plugin_kinds ?? [],
    ),
    automation_values: next('automation_values', snapshot.tables.automation_values ?? []),
    automation_runs: next('automation_runs', snapshot.tables.automation_runs ?? []),
  };
}
