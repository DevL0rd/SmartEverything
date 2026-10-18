import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { deviceLogKey } from '../../../queries/keys';
import { readDeviceLog } from '../../../queries/device-log';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { cardTime, tickerText, tickerTone } from './log-model';

const MINI_ROWS = 3;

export function LogMini({
  deviceId,
  live,
}: {
  readonly deviceId: string;
  readonly live: boolean;
}): ReactNode {
  const entries = useScreenQuery({
    queryKey: deviceLogKey(deviceId, MINI_ROWS),
    queryFn: () => readDeviceLog(deviceId, MINI_ROWS),
    enabled: live,
  }).data;
  if (entries === undefined || entries.length === 0) {
    return null;
  }
  return (
    <View className="gap-1" pointerEvents="none">
      {entries.map((entry) => (
        <View key={`${entry.at}-${entry.kind}-${entry.title}`} className="flex-row gap-3">
          <Text variant="caption" tone="faint" className="tabular w-14 shrink-0">
            {cardTime(entry.at)}
          </Text>
          <Text
            variant="caption"
            tone={tickerTone(entry)}
            numberOfLines={1}
            className="min-w-0 flex-1"
          >
            {tickerText(entry)}
          </Text>
        </View>
      ))}
    </View>
  );
}
