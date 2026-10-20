import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Quarter, QuarterState } from '../model/arch-model';

const FILL: Readonly<Record<QuarterState, string>> = {
  done: 'bg-positive',
  current: 'bg-primary',
  partial: 'bg-warning',
  todo: 'bg-surface-3',
  missed: 'bg-surface-3',
  idle: 'bg-surface-3',
};

export function QuarterBar({ quarters }: { readonly quarters: readonly Quarter[] }): ReactNode {
  return (
    <View aria-hidden className="w-full flex-row gap-1">
      {quarters.map((quarter) => (
        <View key={quarter.index} className="min-w-0 flex-1 gap-1">
          <View className={cn('h-2 rounded-full', FILL[quarter.state])} />
          <Text variant="caption" tone="faint" align="center">
            Q{quarter.index}
          </Text>
        </View>
      ))}
    </View>
  );
}
