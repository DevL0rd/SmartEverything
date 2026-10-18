import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import type { Consumer } from '../model/consumers';

export function ConsumerRows({
  consumers,
}: {
  readonly consumers: readonly Consumer[];
}): ReactNode {
  return (
    <View className="gap-0">
      {consumers.map((consumer) => (
        <View
          key={consumer.deviceId}
          className="min-h-6 flex-row items-center justify-between gap-3"
        >
          <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
            {consumer.name}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={1}>
            {consumer.unit === null
              ? decimal(consumer.value, 0)
              : `${decimal(consumer.value, 0)} ${consumer.unit}`}
          </Text>
        </View>
      ))}
    </View>
  );
}
