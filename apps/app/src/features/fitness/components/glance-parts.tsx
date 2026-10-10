import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { signed } from '../../../format/number';
import type { Delta, DeltaTone } from '../model/glance';

const DELTA_TONE: Readonly<Record<DeltaTone, Tone>> = {
  positive: 'positive',
  critical: 'critical',
  neutral: 'variant',
};

export function DeltaLine({
  delta,
  digits,
  unit,
  against,
}: {
  readonly delta: Delta;
  readonly digits: number;
  readonly unit: string;
  readonly against: string;
}): ReactNode {
  const tone = DELTA_TONE[delta.tone];
  const flat = signed(delta.change, digits) === '±0';
  return (
    <View className="flex-row items-center gap-1">
      {flat ? null : (
        <Icon name={delta.change > 0 ? 'trendUp' : 'trendDown'} size={16} tone={tone} />
      )}
      <Text variant="footnote" tone={tone} className="tabular" numberOfLines={1}>
        {flat
          ? `Same as ${against}`
          : `${signed(delta.change, digits)}${unit === '' ? '' : ` ${unit}`} vs ${against}`}
      </Text>
    </View>
  );
}

export interface QuickStat {
  readonly label: string;
  readonly value: string;
}

export function QuickStats({
  stats,
  vertical = false,
}: {
  readonly stats: readonly QuickStat[];
  readonly vertical?: boolean;
}): ReactNode {
  return (
    <View className={vertical ? 'gap-2' : 'flex-row gap-4'}>
      {stats.map((stat) => (
        <View
          key={stat.label}
          className={vertical ? 'flex-row items-baseline justify-between gap-3' : 'min-w-0 flex-1'}
        >
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {stat.label}
          </Text>
          <Text variant="callout" className="tabular" numberOfLines={1}>
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
