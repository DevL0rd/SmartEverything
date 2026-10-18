import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
  readonly compact?: boolean;
}

function CompactEmptyState({ icon, title, body, action }: EmptyStateProps): ReactNode {
  return (
    <View className="flex-row items-center gap-4 px-2 py-2">
      <View className="size-12 items-center justify-center rounded-full bg-primary-container">
        <Icon name={icon} size={24} tone="primary" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-3">{title}</Text>
        <Text variant="callout" tone="variant">
          {body}
        </Text>
        {action === undefined ? null : <View className="pt-2">{action}</View>}
      </View>
    </View>
  );
}

export function EmptyState(props: EmptyStateProps): ReactNode {
  const { icon, title, body, action, compact = false } = props;
  if (compact) {
    return <CompactEmptyState {...props} />;
  }
  return (
    <View className="items-center gap-3 self-center px-6 py-12">
      <View className="size-20 items-center justify-center rounded-full bg-primary-container">
        <Icon name={icon} size={40} tone="primary" />
      </View>
      <Text variant="title-2" align="center">
        {title}
      </Text>
      <Text variant="body" tone="variant" align="center" className="max-w-reading">
        {body}
      </Text>
      {action === undefined ? null : <View className="pt-2">{action}</View>}
    </View>
  );
}
