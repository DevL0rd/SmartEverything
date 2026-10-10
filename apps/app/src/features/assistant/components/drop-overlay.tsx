import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function DropOverlay(): ReactNode {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-2 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10"
    >
      <Icon name="paperclip" size={32} tone="primary" />
      <Text variant="title-3" tone="primary">
        Drop to attach
      </Text>
    </View>
  );
}
