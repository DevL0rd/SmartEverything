import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps): ReactNode {
  return (
    <View className="items-center gap-3 self-center px-6 py-12">
      <View className="size-20 items-center justify-center rounded-full bg-primary-container">
        <Icon name={icon} size={40} tone="primary" />
      </View>
      <Text variant="title-2" align="center">
        {title}
      </Text>
      <Text
        variant="body"
        tone="variant"
        align="center"
        numberOfLines={2}
        className="max-w-reading"
      >
        {body}
      </Text>
      {action === undefined ? null : <View className="pt-2">{action}</View>}
    </View>
  );
}
