import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import type { TrendStat } from '../model/sleep-trend-text';

export function TrendStats({ stats }: { readonly stats: readonly TrendStat[] }): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {stats.map((stat) => (
        <View key={stat.label} className={cn('gap-0.5 pr-3', split ? 'w-1/4' : 'w-1/2')}>
          <Text variant="body-strong" className="tabular" numberOfLines={1}>
            {stat.value}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {stat.note === undefined ? stat.label : `${stat.label} · ${stat.note}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RangeLabel({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="tabular">
      {text}
    </Text>
  );
}
