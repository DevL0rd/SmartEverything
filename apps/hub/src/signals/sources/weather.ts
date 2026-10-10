import type { RowChange, SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

export function weatherSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'weather') {
    return [];
  }
  const { record, oldRecord } = change;
  if (record === null) {
    return [];
  }
  if (record.forecast === null || record.fetched_at === oldRecord?.fetched_at) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'weather',
      kind: 'forecast',
      subject: null,
      field: null,
      value: record.forecast,
      previous: oldRecord?.forecast ?? null,
      profileId: null,
    }),
  ];
}
