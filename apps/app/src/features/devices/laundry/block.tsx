import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

export function Block({
  icon,
  tone = 'variant',
  title,
  sub,
  divider = true,
  children,
}: {
  readonly icon: 'wrench' | 'refresh' | 'droplet';
  readonly tone?: 'variant' | 'warning';
  readonly title: string;
  readonly sub: string;
  readonly divider?: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className={cn('gap-2', divider && 'border-t-hairline border-outline-variant pt-3')}>
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={20} tone={tone} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{title}</Text>
          <Text variant="footnote" tone="variant">
            {sub}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}
