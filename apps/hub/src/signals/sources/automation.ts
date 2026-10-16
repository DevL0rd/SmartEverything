import { jsonEquals, type RowChange, type SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

export function automationSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  return [...valueSignals(change, context), ...runSignals(change, context)];
}
function valueSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table === 'automation_values' && change.record !== null) {
    const { record, oldRecord } = change;
    if (oldRecord !== null && jsonEquals(record.content.value, oldRecord.content.value)) return [];
    return [
      signalAt(context, {
        source: 'automation_value',
        kind: 'changed',
        subject: record.id,
        field: 'value',
        value: record.content.value,
        previous: oldRecord?.content.value ?? null,
        profileId: null,
        data: { kind: record.content.kind },
      }),
    ];
  }
  return [];
}
function runSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (
    change.table !== 'automation_runs' ||
    change.record === null ||
    change.record.status === change.oldRecord?.status
  )
    return [];
  const record = change.record;
  return [
    signalAt(context, {
      source: 'automation_run',
      kind: 'status',
      subject: record.automation_id,
      field: null,
      value: record.status,
      profileId: null,
      data: { status: record.status, runId: record.id },
    }),
  ];
}
