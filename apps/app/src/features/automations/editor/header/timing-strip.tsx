import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../../design/cn';
import { Text } from '../../../../components/text';
import type { StripBar, TimingValues } from './timing-model';
import { stripBars, stripSummary } from './timing-model';

const GROW = [
  'flex-1',
  'flex-2',
  'flex-3',
  'flex-4',
  'flex-5',
  'flex-6',
  'flex-7',
  'flex-8',
  'flex-9',
  'flex-10',
  'flex-11',
  'flex-12',
] as const;

function Bar({ bar }: { readonly bar: StripBar }): ReactNode {
  return (
    <View className={cn(GROW[bar.weight - 1] ?? 'flex-1', 'min-w-14 gap-1')}>
      <View
        className={cn(
          'h-6 rounded-xs',
          bar.phase === 'before' ? 'bg-primary-container' : 'bg-surface-3',
        )}
      />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {bar.label}
      </Text>
      <Text variant="footnote" numberOfLines={1}>
        {bar.caption}
      </Text>
    </View>
  );
}

function FireMark(): ReactNode {
  return (
    <View className="items-center gap-1">
      <View className="h-6 w-1 rounded-full bg-primary" />
      <Text variant="caption" tone="primary">
        Fires
      </Text>
    </View>
  );
}

export function TimingStrip({ values }: { readonly values: TimingValues }): ReactNode {
  const bars = stripBars(values);
  const before = bars.filter((bar) => bar.phase === 'before');
  const after = bars.filter((bar) => bar.phase === 'after');
  return (
    <View className="gap-2 px-4 py-3">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={stripSummary(values)}
        className="flex-row items-start gap-1"
      >
        {before.map((bar) => (
          <Bar key={bar.name} bar={bar} />
        ))}
        <FireMark />
        {after.map((bar) => (
          <Bar key={bar.name} bar={bar} />
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        {stripSummary(values)}
      </Text>
    </View>
  );
}
