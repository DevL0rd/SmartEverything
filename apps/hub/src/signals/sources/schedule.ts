import type { RowChange, SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

const FINISHED: ReadonlySet<string> = new Set(['done', 'failed', 'cancelled']);

export function scheduleSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'scheduled_actions' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  if (!FINISHED.has(record.state) || oldRecord?.state === record.state) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'schedule',
      kind: 'finished',
      subject: record.id,
      field: null,
      value: record.state,
      profileId: record.profile_id,
      data: { outcome: record.state, label: record.label },
    }),
  ];
}
