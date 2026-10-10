import { jsonEquals, type RowChange } from '@smarteverything/domain';

export function onlyRunBookkeeping(change: RowChange): boolean {
  if (change.table !== 'automations' || change.operation !== 'UPDATE') {
    return false;
  }
  const { record, oldRecord } = change;
  return (
    record !== null &&
    oldRecord !== null &&
    record.name === oldRecord.name &&
    record.enabled === oldRecord.enabled &&
    jsonEquals(record.definition, oldRecord.definition)
  );
}
