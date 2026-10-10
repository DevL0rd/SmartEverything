import type { RowChange, SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

const FINISHED: ReadonlySet<string> = new Set(['answered', 'failed']);

export function assistantSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'assistant_messages' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  const outcome = record.state;
  if (
    record.role !== 'responder' ||
    outcome === null ||
    !FINISHED.has(outcome) ||
    oldRecord?.state === outcome
  ) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'assistant',
      kind: 'reply_finished',
      subject: record.chat_id,
      field: null,
      value: outcome,
      profileId: record.profile_id,
      data: { outcome, messageId: record.id },
    }),
  ];
}
