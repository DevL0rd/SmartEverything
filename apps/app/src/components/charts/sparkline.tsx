import { scaleLinear } from 'd3-scale';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { useMeasuredWidth } from '../use-measured-width';
import { reduced } from './reduce';
import { areaPath, extentOf, linePath, segmentsOf, type ChartPoint } from './scale';

export interface SparklineProps {
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly height?: number;
  readonly area?: boolean;
  readonly maxGap?: number;
  readonly domain?: readonly [number, number];
}

const INSET = 2;
const AREA_OPACITY = 0.16;

interface Shape {
  readonly line: string;
  readonly area: string;
}

function shapesOf(
  points: readonly ChartPoint[],
  { width, height }: { readonly width: number; readonly height: number },
  maxGap: number | undefined,
  domain: readonly [number, number] | undefined,
): Shape[] {
  const sorted = [...points].filter((point) => Number.isFinite(point.v)).sort((a, b) => a.t - b.t);
  const times = extentOf(sorted.map((point) => point.t));
  const values =
    domain === undefined
      ? extentOf(sorted.map((point) => point.v))
      : { min: domain[0], max: domain[1] };
  if (times === null || values === null) {
    return [];
  }
  const x = scaleLinear([times.min, times.max], [INSET, width - INSET]);
  const y = scaleLinear([values.min, values.max], [height - INSET, INSET]);
  const gap = maxGap ?? Number.POSITIVE_INFINITY;
  return segmentsOf(sorted, gap).map((full) => {
    const segment = reduced(full, width);
    const placed = segment.map((point) => ({ x: x(point.t), y: y(point.v) }));
    return { line: linePath(placed), area: areaPath(placed, height) };
  });
}

export const Sparkline = memo(function Sparkline({
  points,
  colour,
  height = 32,
  area = false,
  maxGap,
  domain,
}: SparklineProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const stroke = useColour(colour);
  const reveal = useDraw(1, !useMotion().reduced);
  const box = { height };
  const clip = useAnimatedStyle(() => ({ width: width * reveal.get(), height }), [width, height]);
  const shapes = width > 0 ? shapesOf(points, { width, height }, maxGap, domain) : [];
  return (
    <View style={box} className="w-full" aria-hidden onLayout={onLayout}>
      {width > 0 ? (
        <Animated.View style={clip} className="overflow-hidden">
          <Svg width={width} height={height}>
            {area
              ? shapes.map((shape) => (
                  <Path
                    key={`area-${shape.line}`}
                    d={shape.area}
                    fill={stroke}
                    fillOpacity={AREA_OPACITY}
                  />
                ))
              : null}
            {shapes.map((shape) => (
              <Path
                key={shape.line}
                d={shape.line}
                fill="none"
                stroke={stroke}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
});
