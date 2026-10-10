import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { extentOf, linePath, scaleLinear, segmentsOf, type ChartPoint } from './scale';

export interface SparklineProps {
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly height?: number;
  readonly area?: boolean;
  readonly maxGap?: number;
}

const INSET = 2;
const AREA_OPACITY = 0.16;

interface Shape {
  readonly line: string;
  readonly area: string;
}

function shapesOf(props: SparklineProps, width: number, height: number): Shape[] {
  const sorted = [...props.points]
    .filter((point) => Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  const times = extentOf(sorted.map((point) => point.t));
  const values = extentOf(sorted.map((point) => point.v));
  if (times === null || values === null) {
    return [];
  }
  const x = scaleLinear(times, { min: INSET, max: width - INSET });
  const y = scaleLinear(values, { min: height - INSET, max: INSET });
  const gap = props.maxGap ?? Number.POSITIVE_INFINITY;
  return segmentsOf(sorted, gap).map((segment) => {
    const placed = segment.map((point) => ({ x: x(point.t), y: y(point.v) }));
    const line = linePath(placed);
    const first = placed[0]?.x ?? 0;
    const last = placed[placed.length - 1]?.x ?? 0;
    return {
      line,
      area: `${line} L${last.toFixed(1)} ${String(height)} L${first.toFixed(1)} ${String(height)} Z`,
    };
  });
}

export function Sparkline(props: SparklineProps): ReactNode {
  const { colour, height = 32, area = false } = props;
  const [width, setWidth] = useState(0);
  const stroke = useColour(colour);
  const reveal = useDraw(1, !useMotion().reduced);
  const box = { height };
  const clip = useAnimatedStyle(() => ({ width: width * reveal.get(), height }), [width, height]);
  const shapes = width > 0 ? shapesOf(props, width, height) : [];
  return (
    <View
      style={box}
      className="w-full"
      aria-hidden
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
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
}
