import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Drain } from './listener-model';

const LEVELS = [1, 2, 3] as const;

export function DrainBar({
  level,
  text,
}: {
  readonly level: Drain;
  readonly text: string;
}): ReactNode {
  return (
    <View
      role="img"
      accessibilityLabel={`Battery cost: ${text}`}
      className="flex-row items-center gap-2"
    >
      <View className="flex-row gap-1">
        {LEVELS.map((step) => (
          <View
            key={step}
            className={cn('h-1.5 w-5 rounded-full', step <= level ? 'bg-warning' : 'bg-surface-3')}
          />
        ))}
      </View>
      <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
        {text}
      </Text>
    </View>
  );
}
