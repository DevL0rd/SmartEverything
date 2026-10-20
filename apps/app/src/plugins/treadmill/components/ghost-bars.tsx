import type { StatsBucket, StatsRange } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { BarLabels, BarMarks, type BarShape } from '../../../components/charts/bar-marks';
import { barSlots, type BarSlot } from '../../../components/charts/bar-path';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';
import { bucketLabel, metricOf, type Metric } from '../model/stats-model';

const RADIUS = 3;
const GHOST_OPACITY = 0.28;
const GAP_SHARE = 0.25;

interface AverageLine {
  readonly values: readonly number[];
  readonly colour: ColourRole;
}

export interface GhostBarsProps {
  readonly buckets: readonly StatsBucket[];
  readonly previous: readonly StatsBucket[];
  readonly range: StatsRange;
  readonly metric: Metric;
  readonly label: string;
  readonly height?: number;
  readonly lines?: readonly AverageLine[];
  readonly colour?: ColourRole;
}

interface Plot {
  readonly width: number;
  readonly height: number;
  readonly peak: number;
}

function shapesOf(
  slots: readonly BarSlot[],
  values: readonly number[],
  plot: Plot,
  opacity: number,
): BarShape[] {
  return values.flatMap((value, index): BarShape[] => {
    const slot = slots[index];
    const top = plot.height - (Math.max(0, value) / plot.peak) * plot.height;
    if (slot === undefined || value <= 0) {
      return [];
    }
    return [
      {
        key: `${String(opacity)}-${String(index)}`,
        x: slot.x,
        width: slot.width,
        top,
        bottom: plot.height,
        radii: { top: RADIUS, bottom: 0 },
        opacity,
      },
    ];
  });
}

function linePath(slots: readonly BarSlot[], values: readonly number[], plot: Plot): string {
  return values
    .map((value, index) => {
      const slot = slots[index];
      const y = plot.height - (Math.max(0, value) / plot.peak) * plot.height;
      return slot === undefined
        ? ''
        : `${index === 0 ? 'M' : 'L'}${(slot.x + slot.width / 2).toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function AverageStroke({
  line,
  slots,
  plot,
}: {
  readonly line: AverageLine;
  readonly slots: readonly BarSlot[];
  readonly plot: Plot;
}): ReactNode {
  const stroke = useColour(line.colour);
  return (
    <Path
      d={linePath(slots, line.values, plot)}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function GhostBars({
  buckets,
  previous,
  range,
  metric,
  label,
  height = 120,
  lines = [],
  colour = 'primary',
}: GhostBarsProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const fill = useColour(colour);
  const baseline = useColour('outline');
  const current = buckets.map((bucket) => metricOf(bucket, metric));
  const before = previous.map((bucket) => metricOf(bucket, metric));
  const peak = Math.max(0.0001, ...current, ...before, ...lines.flatMap((line) => line.values));
  const plot: Plot = { width, height, peak };
  const slots = barSlots(buckets.length, width, { gap: GAP_SHARE, min: 1 });
  const box = { height };
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <Text variant="caption" tone="faint" className="tabular">
        {decimal(peak, peak < 10 ? 1 : 0)}
      </Text>
      <View style={box} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <BarMarks shapes={shapesOf(slots, before, plot, GHOST_OPACITY)} fill={fill} />
            <BarMarks shapes={shapesOf(slots, current, plot, 1)} fill={fill} />
            {lines.map((line) => (
              <AverageStroke key={line.colour} line={line} slots={slots} plot={plot} />
            ))}
            <Line
              x1={0}
              x2={width}
              y1={height - 0.5}
              y2={height - 0.5}
              stroke={baseline}
              strokeWidth={1}
            />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={buckets.map((bucket) => ({ key: bucket.key, label: bucketLabel(range, bucket.key) }))}
        width={width}
      />
    </View>
  );
}
