import type { AutomationRunRow } from './automation-runs';
import type { LiveChange } from './api/live';

export const AUTOMATION_RUN_DETAILS_CAPABILITY = 'automation-runtime-v2';
export function automationRunForReader(run: AutomationRunRow, details: boolean): AutomationRunRow {
  if (details) return run;
  const { target_type: _targetType, ...legacy } = run;
  return legacy;
}
export function automationRunVisible(run: AutomationRunRow, details: boolean): boolean {
  return details || run.target_type !== 'sequence';
}
export function automationChangeForReader(change: LiveChange, details: boolean): LiveChange | null {
  if (change.table === 'automation_sequences') return details ? change : null;
  if (change.table !== 'automation_runs' || details) return change;
  const row = change.record ?? change.oldRecord;
  if (row !== null && !automationRunVisible(row, false)) return null;
  return {
    ...change,
    record: change.record === null ? null : automationRunForReader(change.record, false),
    oldRecord: change.oldRecord === null ? null : automationRunForReader(change.oldRecord, false),
  };
}
