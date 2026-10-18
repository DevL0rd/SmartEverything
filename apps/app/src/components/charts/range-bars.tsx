import { scaleLinear } from 'd3-scale';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { decimal } from '../../format/number';
import { useMeasuredWidth } from '../use-measured-width';
import { Text } from '../text';
import { BarLabels, BarMarks, type BarShape } from './bar-marks';
import { barSlots } from './bar-path';
import { extentOf, niceTicks, type Extent } from './scale';

export interface RangeBucket {
  readonly key: string;
  readonly label?: string;
  readonly min: number | null;
  readonly max: number | null;
}

export interface RangeBarsProps {
  readonly buckets: readonly RangeBucket[];
  readonly colour: ColourRole;
  readonly label: string;
  readonly height?: number;
  readonly formatValue?: (value: number) => string;
}

const GAP_SHARE = 0.35;
const MAX_BAR = 10;
const AXIS = 32;

const plain = (value: number): string => decimal(value);

function capsulesOf(
  buckets: readonly RangeBucket[],
  domain: Extent,
  width: number,
  height: number,
): BarShape[] {
  const y = scaleLinear([domain.min, domain.max], [height, 0]);
  const slots = barSlots(buckets.length, width, { gap: GAP_SHARE, min: 2, max: MAX_BAR });
  return buckets.flatMap((bucket, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined || bucket.min === null || bucket.max === null) {
      return [];
    }
    const high = y(Math.max(bucket.min, bucket.max));
    const low = y(Math.min(bucket.min, bucket.max));
    const length = Math.max(slot.width, low - high);
    const middle = (high + low) / 2;
    return [
      {
        key: bucket.key,
        x: slot.x,
        width: slot.width,
        top: middle - length / 2,
        bottom: middle + length / 2,
        radii: { top: slot.width / 2, bottom: slot.width / 2 },
        opacity: 1,
      },
    ];
  });
}

function AxisLabels({
  ticks,
  format,
}: {
  readonly ticks: readonly number[];
  readonly format: (value: number) => string;
}): ReactNode {
  return (
    <View className="w-8 justify-between">
      {[...ticks].reverse().map((tick) => (
        <Text key={tick} variant="caption" tone="faint" numberOfLines={1} className="tabular">
          {format(tick)}
        </Text>
      ))}
    </View>
  );
}

interface GridProps {
  readonly ticks: readonly number[];
  readonly domain: Extent;
  readonly width: number;
  readonly height: number;
}

function Gridlines({ ticks, domain, width, height }: GridProps): ReactNode {
  const grid = useColour('outline-variant');
  const y = scaleLinear([domain.min, domain.max], [height - 0.5, 0.5]);
  return (
    <>
      {ticks.map((tick) => (
        <Line
          key={tick}
          x1={0}
          x2={width}
          y1={y(tick)}
          y2={y(tick)}
          stroke={grid}
          strokeWidth={1}
        />
      ))}
    </>
  );
}

export const RangeBars = memo(function RangeBars({
  buckets,
  colour,
  label,
  height = 140,
  formatValue = plain,
}: RangeBarsProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const fill = useColour(colour);
  const extent = extentOf(
    buckets.flatMap((bucket) =>
      bucket.min === null || bucket.max === null ? [] : [bucket.min, bucket.max],
    ),
  );
  const ticks = extent === null ? [] : niceTicks(extent);
  const domain = { min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 0 };
  const box = { height };
  const plotWidth = Math.max(0, width - AXIS);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="gap-1"
      onLayout={onLayout}
    >
      <View style={box} className="flex-row">
        <AxisLabels ticks={ticks} format={formatValue} />
        {plotWidth > 0 ? (
          <Svg width={plotWidth} height={height}>
            <Gridlines ticks={ticks} domain={domain} width={plotWidth} height={height} />
            <BarMarks shapes={capsulesOf(buckets, domain, plotWidth, height)} fill={fill} />
          </Svg>
        ) : null}
      </View>
      {buckets.some((bucket) => bucket.label !== undefined) ? (
        <View className="ml-8">
          <BarLabels bars={buckets} width={plotWidth} />
        </View>
      ) : null}
    </View>
  );
});
