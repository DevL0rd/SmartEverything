import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import type { Tone } from '../../../components/tone';

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: Tone;
}

export function StatList({ stats }: { readonly stats: readonly Stat[] }): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className={cn(split ? 'gap-3' : 'flex-row flex-wrap gap-x-6 gap-y-3')}>
      {stats.map((stat) => (
        <View key={stat.label} className={cn('gap-0.5', !split && 'min-w-32')}>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {stat.label}
          </Text>
          <Text variant="body-strong" className="tabular" numberOfLines={1}>
            {stat.value}
          </Text>
          {stat.note === undefined ? null : (
            <Text variant="footnote" tone={stat.tone ?? 'faint'} numberOfLines={1}>
              {stat.note}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
