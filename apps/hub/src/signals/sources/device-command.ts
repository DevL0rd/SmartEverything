import {
  COMMAND_SIGNAL_OF_STATUS,
  type RowChange,
  type SignalInput,
} from '@smarteverything/domain';
import { signalAt, type FeedContext } from './feed-context';

export function deviceCommandSignals(
  change: RowChange,
  context: FeedContext,
): readonly SignalInput[] {
  if (change.table !== 'commands' || change.record === null) {
    return [];
  }
  const { record, oldRecord } = change;
  const status = COMMAND_SIGNAL_OF_STATUS[record.status];
  if (record.device_id === null || status === null || oldRecord?.status === record.status) {
    return [];
  }
  return [
    signalAt(context, {
      source: 'device',
      kind: 'command',
      subject: record.device_id,
      field: record.capability,
      value: record.value,
      profileId: null,
      data: {
        status,
        capability: record.capability,
        cause: record.source,
        commandId: record.id,
        error: record.error,
      },
    }),
  ];
}
