import { providerStateOf, type RowChange, type SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

export function providerSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'provider_links' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  const state = providerStateOf(record);
  if (state === null) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'provider',
      kind: 'status',
      subject: record.provider,
      field: null,
      value: state,
      previous: oldRecord === null ? null : providerStateOf(oldRecord),
      profileId: null,
      data: {
        state,
        provider: record.provider,
        problem: record.problem,
        error: record.last_error,
      },
    }),
  ];
}
