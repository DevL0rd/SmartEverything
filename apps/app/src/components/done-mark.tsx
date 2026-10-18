import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from './icon';

export function DoneMark(): ReactNode {
  return (
    <View className="size-16 items-center justify-center rounded-full bg-positive/14">
      <Icon name="check" size={32} tone="positive" />
    </View>
  );
}
