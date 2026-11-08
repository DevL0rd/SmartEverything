import { memo, type ReactNode } from 'react';
import type { DeviceLogEntry } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cardTime, tickerText, tickerTone } from './log-model';
import { useLatestLogEntry } from './use-device-log';

export const LogTicker = memo(function LogTicker({
  deviceId,
  live,
  omit,
  lines = 1,
}: {
  readonly deviceId: string;
  readonly live: boolean;
  readonly omit?: DeviceLogEntry['kind'];
  readonly lines?: 1 | 2;
}): ReactNode {
  const entry = useLatestLogEntry(deviceId, live);
  if (entry === undefined || entry.kind === omit) {
    return null;
  }
  return (
    <Text variant="caption" tone={tickerTone(entry)} numberOfLines={lines} align="end">
      {`${cardTime(entry.at)} · ${tickerText(entry)}`}
    </Text>
  );
});
