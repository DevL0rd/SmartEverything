import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FigureSize } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { TYPE_SCALE, type Idiom, type TypeRole } from '../../../design/tokens';
import { signed } from '../../../format/number';
import type { Delta, DeltaTone } from '../model/glance';

const FIGURE_STEPS: readonly FigureSize[] = ['xl', 'l', 'm', 's'];

export interface FigureRoom {
  readonly room: number;
  readonly idiom: Idiom;
  readonly largest: FigureSize;
  readonly below?: readonly TypeRole[];
  readonly gap?: number;
}

export function figureFitOf({ room, idiom, largest, below = [], gap = 0 }: FigureRoom): FigureSize {
  const type = TYPE_SCALE[idiom];
  const rest = below.reduce((sum, role) => sum + type[role][1] + gap, 0);
  const steps = FIGURE_STEPS.slice(FIGURE_STEPS.indexOf(largest));
  return steps.find((size) => type[`figure-${size}`][1] + rest <= room) ?? 's';
}

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
  wrap = false,
}: {
  readonly delta: Delta;
  readonly digits: number;
  readonly unit: string;
  readonly against: string;
  readonly wrap?: boolean;
}): ReactNode {
  const tone = DELTA_TONE[delta.tone];
  const flat = signed(delta.change, digits) === '±0';
  return (
    <View className="flex-row items-center gap-1">
      {flat ? null : (
        <Icon name={delta.change > 0 ? 'trendUp' : 'trendDown'} size={16} tone={tone} />
      )}
      <Text
        variant="footnote"
        tone={tone}
        className={wrap ? 'min-w-0 shrink tabular' : 'tabular'}
        numberOfLines={wrap ? undefined : 1}
      >
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
  compact = false,
}: {
  readonly stats: readonly QuickStat[];
  readonly vertical?: boolean;
  readonly compact?: boolean;
}): ReactNode {
  const row = compact
    ? 'flex-row items-baseline justify-between gap-1'
    : 'flex-row items-baseline justify-between gap-3';
  const horizontal = compact ? 'flex-row gap-2' : 'flex-row gap-4';
  const verticalGap = compact ? 'gap-1' : 'gap-2';
  const tightRow = compact && vertical;
  const lines = compact ? undefined : 1;
  return (
    <View className={vertical ? verticalGap : horizontal}>
      {stats.map((stat) => (
        <View key={stat.label} className={vertical ? row : 'min-w-0 flex-1'}>
          <Text
            variant="caption"
            tone="faint"
            className={cn(tightRow && 'min-w-0 shrink')}
            numberOfLines={lines}
          >
            {stat.label}
          </Text>
          <Text
            variant="callout"
            className={cn('tabular', tightRow && 'shrink-0')}
            numberOfLines={lines}
          >
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
