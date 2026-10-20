import type { CallOutreachState, RowChange, SignalInput } from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

const REPORTED: Readonly<Partial<Record<string, CallOutreachState>>> = {
  ringing: 'ringing',
  live: 'answered',
  declined: 'declined',
  missed: 'missed',
  failed: 'failed',
  sent: 'sent',
};

export function outreachSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  if (change.table !== 'ai_outreach' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  const state = REPORTED[record.state];
  if (state === undefined || oldRecord?.state === record.state) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'call',
      kind: 'outreach',
      subject: record.profile_id,
      field: null,
      value: state,
      profileId: record.profile_id,
      data: {
        state,
        outreachId: record.id,
        how: record.how,
        target: record.target_label,
        urgent: record.urgent,
        callId: record.call_id,
      },
    }),
  ];
}
