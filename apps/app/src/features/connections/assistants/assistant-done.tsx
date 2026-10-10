import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function AssistantDone({ name }: { readonly name: string }): ReactNode {
  return (
    <View className="items-center gap-2 py-4">
      <View className="size-16 items-center justify-center rounded-full bg-positive/14">
        <Icon name="check" size={32} tone="positive" />
      </View>
      <Text variant="title-2" align="center">
        {`${name} is connected`}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        Ask it about your home.
      </Text>
    </View>
  );
}
