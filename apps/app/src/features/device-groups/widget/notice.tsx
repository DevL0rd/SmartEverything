import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';

export function Notice({
  icon = 'info',
  text,
  children,
}: {
  readonly icon?: IconName;
  readonly text: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-6 flex-row flex-wrap items-center gap-x-2">
      <Icon name={icon} size={16} />
      <Text variant="footnote" tone="variant">
        {text}
      </Text>
      {children}
    </View>
  );
}
