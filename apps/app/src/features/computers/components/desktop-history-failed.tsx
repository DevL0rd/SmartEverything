import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { nativeSessionsKey } from '../data/computer-ai';

export function DesktopHistoryFailed({
  deviceId,
  name,
  reason,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly reason: string;
}): ReactNode {
  const client = useQueryClient();
  return (
    <View className="flex-row items-center gap-3 px-gutter py-2">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label">Claude Desktop chats didn’t load</Text>
        <Text variant="caption" tone="variant">
          {name}: {reason}
        </Text>
      </View>
      <Button
        label="Retry"
        variant="tonal"
        onPress={(): void => {
          background(
            client.invalidateQueries({ queryKey: nativeSessionsKey(deviceId, false) }),
            'desktop_history.retry_failed',
          );
        }}
      />
    </View>
  );
}
