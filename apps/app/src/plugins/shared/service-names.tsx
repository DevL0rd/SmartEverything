import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/text';
import { useRoomName } from '../../store/selectors';
import type { Device } from '../../store/state';

export function ServiceNames({
  device,
  line,
  showRoom,
  lines,
}: {
  readonly device: Device;
  readonly line: string;
  readonly showRoom: boolean;
  readonly lines: number;
}): ReactNode {
  const room = useRoomName(device.id);
  return (
    <View className="min-w-0 gap-0.5">
      <Text variant="body-strong" numberOfLines={lines}>
        {device.label}
      </Text>
      {showRoom && room !== null ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {room}
        </Text>
      ) : null}
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}
