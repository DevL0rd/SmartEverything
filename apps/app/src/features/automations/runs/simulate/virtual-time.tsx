import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { virtualTimeText, type VirtualTime } from './scenario-model';

export function VirtualTimeHeader(props: VirtualTime): ReactNode {
  return (
    <View className="flex-row items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
      <Icon name="clock" tone="primary" />
      <Text variant="callout">{virtualTimeText(props)}</Text>
    </View>
  );
}
