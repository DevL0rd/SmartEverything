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

export function StatList({
  stats,
  wrap = false,
}: {
  readonly stats: readonly Stat[];
  readonly wrap?: boolean;
}): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className={cn(split && !wrap ? 'gap-3' : 'flex-row flex-wrap gap-x-4 gap-y-2')}>
      {stats.map((stat) => (
        <View key={stat.label} className="max-w-full gap-0.5">
          <Text variant="footnote" tone="variant">
            {stat.label}
          </Text>
          <Text variant="body-strong" className="tabular">
            {stat.value}
          </Text>
          {stat.note === undefined ? null : (
            <Text variant="footnote" tone={stat.tone ?? 'faint'}>
              {stat.note}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
