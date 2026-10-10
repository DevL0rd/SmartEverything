import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { decimal } from '../../format/number';
import { Text } from '../text';
import { extentOf, niceTicks, scaleLinear, type Extent } from './scale';

export interface RangeBucket {
  readonly key: string;
  readonly min: number;
  readonly max: number;
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

interface Capsule {
  readonly key: string;
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

function capsulesOf(
  buckets: readonly RangeBucket[],
  domain: Extent,
  width: number,
  height: number,
): Capsule[] {
  const y = scaleLinear(domain, { min: height, max: 0 });
  const slot = width / Math.max(1, buckets.length);
  const barWidth = Math.max(2, Math.min(MAX_BAR, slot * (1 - GAP_SHARE)));
  return buckets.map((bucket, index) => {
    const top = y(Math.max(bucket.min, bucket.max)) + barWidth / 2;
    const bottom = y(Math.min(bucket.min, bucket.max)) - barWidth / 2;
    const middle = (top + bottom) / 2;
    return {
      key: bucket.key,
      x: index * slot + slot / 2,
      top: Math.min(top, middle),
      bottom: Math.max(bottom, middle),
      width: barWidth,
    };
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
  const y = scaleLinear(domain, { min: height - 0.5, max: 0.5 });
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

export function RangeBars({
  buckets,
  colour,
  label,
  height = 140,
  formatValue = (value: number): string => decimal(value),
}: RangeBarsProps): ReactNode {
  const [width, setWidth] = useState(0);
  const fill = useColour(colour);
  const extent = extentOf(buckets.flatMap((bucket) => [bucket.min, bucket.max]));
  const ticks = extent === null ? [] : niceTicks(extent);
  const domain = { min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 0 };
  const box = { height };
  const plotWidth = Math.max(0, width - AXIS);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={box}
      className="flex-row"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <AxisLabels ticks={ticks} format={formatValue} />
      {plotWidth > 0 ? (
        <Svg width={plotWidth} height={height}>
          <Gridlines ticks={ticks} domain={domain} width={plotWidth} height={height} />
          {capsulesOf(buckets, domain, plotWidth, height).map((capsule) => (
            <Line
              key={capsule.key}
              x1={capsule.x}
              x2={capsule.x}
              y1={capsule.top}
              y2={capsule.bottom}
              stroke={fill}
              strokeWidth={capsule.width}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
