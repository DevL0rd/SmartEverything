import type { PlannerLap } from '@smarteverything/domain';
import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Dot } from '../../components/badge';
import { Card } from '../../components/card';
import { BarLabels, BarMarks, type BarShape } from '../../components/charts/bar-marks';
import { barSlots } from '../../components/charts/bar-path';
import { Text } from '../../components/text';
import { useMeasuredWidth } from '../../components/use-measured-width';
import { useColour } from '../../design/colour';
import {
  averageSplitOf,
  lapExtremesOf,
  lapFloorOf,
  lapMarkOf,
  lapTime,
  type LapExtremes,
  type LapMark,
} from './lap-model';

const GAP_SHARE = 0.3;
const RADIUS = 6;
const COMPACT_HEIGHT = 96;
const WIDE_HEIGHT = 160;

interface Fills {
  readonly best: string;
  readonly slowest: string;
  readonly other: string;
}

function fillOf(mark: LapMark, fills: Fills): string {
  if (mark === 'best') return fills.best;
  return mark === 'slowest' ? fills.slowest : fills.other;
}

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly floor: number;
  readonly peak: number;
}

function shapesOf(laps: readonly PlannerLap[], frame: Frame, fills: Fills): BarShape[] {
  const extremes = lapExtremesOf(laps);
  const slots = barSlots(laps.length, frame.width, { gap: GAP_SHARE, min: 1 });
  const y = scaleLinear([frame.floor, frame.peak], [frame.height, 0]);
  return laps.flatMap((lap, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined) return [];
    return [
      {
        key: String(index),
        x: slot.x,
        width: slot.width,
        top: y(lap.split_ms),
        bottom: frame.height,
        radii: { top: RADIUS, bottom: RADIUS },
        opacity: 1,
        fill: fillOf(lapMarkOf(index, extremes), fills),
      },
    ];
  });
}

function chartLabelOf(laps: readonly PlannerLap[], extremes: LapExtremes | null): string {
  const count = `Lap times for ${String(laps.length)} ${laps.length === 1 ? 'lap' : 'laps'}`;
  const best = extremes === null ? undefined : laps[extremes.best];
  const slowest = extremes === null ? undefined : laps[extremes.slowest];
  if (extremes === null || best === undefined || slowest === undefined) return count;
  return `${count}, best lap ${String(extremes.best + 1)} at ${lapTime(best.split_ms)}, slowest lap ${String(extremes.slowest + 1)} at ${lapTime(slowest.split_ms)}`;
}

function Legend({ average }: { readonly average: number | null }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <View className="flex-row items-center gap-1">
        <Dot tone="positive" />
        <Text variant="caption" tone="variant">
          Best
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Dot tone="critical" />
        <Text variant="caption" tone="variant">
          Slowest
        </Text>
      </View>
      {average === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {`Average ${lapTime(average)}`}
        </Text>
      )}
    </View>
  );
}

function Chart({
  laps,
  height,
}: {
  readonly laps: readonly PlannerLap[];
  readonly height: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const fills = {
    best: useColour('positive'),
    slowest: useColour('critical'),
    other: useColour('surface-3'),
  };
  const guide = useColour('outline');
  const average = averageSplitOf(laps) ?? 0;
  const peak = Math.max(...laps.map((lap) => lap.split_ms));
  const floor = lapFloorOf(laps);
  const frame = { width, height, floor, peak: peak === floor ? floor + 1 : peak };
  const guideY = scaleLinear([frame.floor, frame.peak], [height, 0])(average);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={chartLabelOf(laps, lapExtremesOf(laps))}
      className="gap-1"
    >
      <View className={height === COMPACT_HEIGHT ? 'h-24' : 'h-40'} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <BarMarks shapes={shapesOf(laps, frame, fills)} fill={fills.other} />
            <Line x1={0} x2={width} y1={guideY} y2={guideY} stroke={guide} strokeDasharray="4 4" />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={laps.map((_, index) => ({ key: String(index), label: String(index + 1) }))}
        width={width}
      />
    </View>
  );
}

export function LapBars({
  laps,
  compact,
}: {
  readonly laps: readonly PlannerLap[];
  readonly compact: boolean;
}): ReactNode {
  return (
    <Card title="Lap times" action={<Legend average={averageSplitOf(laps)} />}>
      <Chart laps={laps} height={compact ? COMPACT_HEIGHT : WIDE_HEIGHT} />
    </Card>
  );
}
