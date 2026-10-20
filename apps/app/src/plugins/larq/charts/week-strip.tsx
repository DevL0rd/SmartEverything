import type { BottleBar } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { ChartKey, type KeyEntry } from './chart-key';
import { WATER_COLOUR } from '../model/bottle-colours';
import { barLabelOf, barsPeak, barsSummary } from '../model/stats-model';

const LABEL_BAND = 18;
const KEY_BAND = 20;

const KEY: readonly KeyEntry[] = [
  { label: 'Goal met or today', colour: WATER_COLOUR, mark: 'solid' },
  { label: 'Under goal', colour: WATER_COLOUR, mark: 'outline' },
];

function Column({
  bar,
  peak,
  plot,
  today,
}: {
  readonly bar: BottleBar;
  readonly peak: number;
  readonly plot: number;
  readonly today: boolean;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const met = today || bar.goalMet;
  const fill = {
    backgroundColor: met ? water : 'transparent',
    borderColor: water,
    height: Math.max(3, (plot * bar.totalMl) / peak),
  };
  return (
    <View className="min-w-0 flex-1 items-center justify-end gap-1">
      <View style={fill} className="w-full max-w-10 rounded-t-sm border-2" />
      <Text variant="caption" tone={today ? 'default' : 'variant'} numberOfLines={1}>
        {barLabelOf(bar.key, 'week')}
      </Text>
    </View>
  );
}

export function WeekStrip({
  bars,
  goalMl,
  height,
}: {
  readonly bars: readonly BottleBar[];
  readonly goalMl: number;
  readonly height: number;
}): ReactNode {
  const goal = { borderColor: useColour('on-surface-variant') };
  const peak = barsPeak(bars);
  const plot = height - LABEL_BAND - KEY_BAND;
  const line = { ...goal, top: plot - (plot * goalMl) / peak };
  const frame = { height };
  const strip = { height: height - KEY_BAND };
  return (
    <View style={frame} className="gap-1">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={barsSummary(bars, 'week')}
        style={strip}
        className="flex-row gap-1.5"
      >
        {bars.map((bar, index) => (
          <Column
            key={bar.key}
            bar={bar}
            peak={peak}
            plot={plot}
            today={index === bars.length - 1}
          />
        ))}
        {goalMl > 0 ? (
          <View
            pointerEvents="none"
            style={line}
            className="absolute inset-x-0 border-t border-dashed"
          />
        ) : null}
      </View>
      <ChartKey entries={KEY} />
    </View>
  );
}
