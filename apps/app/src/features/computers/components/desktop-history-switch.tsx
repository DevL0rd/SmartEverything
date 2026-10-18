import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useComputerAi, useComputerAiChange } from '../data/computer-ai';

export function DesktopHistorySwitch({
  deviceId,
  name,
}: {
  readonly deviceId: string;
  readonly name: string;
}): ReactNode {
  const status = useComputerAi(deviceId);
  const change = useComputerAiChange(deviceId);
  return (
    <View className="flex-row items-center gap-3 px-gutter py-2">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label">Claude Desktop chats are hidden</Text>
        <Text variant="caption" tone="variant">
          Turn on Earlier Claude history for {name} to list its Desktop sessions here.
        </Text>
      </View>
      <Switch
        value={status.data?.settings.control.enabled ?? false}
        label={`Earlier Claude history on ${name}`}
        disabled={status.data === undefined || change.isPending}
        onChange={(enabled) => {
          change.mutate({ control: { enabled } });
        }}
      />
    </View>
  );
}
