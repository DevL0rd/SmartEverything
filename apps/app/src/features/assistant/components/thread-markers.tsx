import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function DayChip({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="items-center pb-3 pt-2">
      <View className="rounded-full bg-surface-2 px-3 py-0.5">
        <Text variant="caption" tone="variant">
          {label}
        </Text>
      </View>
    </View>
  );
}

export function TimeGap({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="items-center pb-1 pt-3">
      <Text variant="caption" tone="variant" className="tabular">
        {label}
      </Text>
    </View>
  );
}

export function UnreadDivider(): ReactNode {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="New messages"
      className="flex-row items-center gap-3 py-3"
    >
      <View className="h-px flex-1 bg-primary/40" />
      <Text variant="caption" tone="primary">
        New
      </Text>
      <View className="h-px flex-1 bg-primary/40" />
    </View>
  );
}
