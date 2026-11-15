import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Path } from 'react-native-svg';
import { Text } from '../text';
import { barPath, type BarBox, type BarRadii } from './bar-path';
import { barLabelPlacesOf } from './scale';

export interface BarShape extends BarBox {
  readonly key: string;
  readonly radii: BarRadii;
  readonly opacity: number;
  readonly fill?: string;
  readonly grow?: SharedValue<number>;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
export const BAR_STUB = 3;

function GrowingBar({
  shape,
  grow,
  fill,
}: {
  readonly shape: BarShape;
  readonly grow: SharedValue<number>;
  readonly fill: string;
}): ReactNode {
  const { top, bottom, x, width, radii } = shape;
  const animated = useAnimatedProps(() => {
    const reached = Math.min(bottom - BAR_STUB, bottom - (bottom - top) * grow.get());
    return { d: barPath({ x, width, top: reached, bottom }, radii) };
  }, [x, width, top, bottom, radii.top, radii.bottom]);
  return <AnimatedPath fill={fill} fillOpacity={shape.opacity} animatedProps={animated} />;
}

export function BarMarks({
  shapes,
  fill,
}: {
  readonly shapes: readonly BarShape[];
  readonly fill: string;
}): ReactNode {
  return shapes.map((shape) =>
    shape.grow === undefined ? (
      <Path
        key={shape.key}
        d={barPath(shape, shape.radii)}
        fill={shape.fill ?? fill}
        fillOpacity={shape.opacity}
      />
    ) : (
      <GrowingBar key={shape.key} shape={shape} grow={shape.grow} fill={shape.fill ?? fill} />
    ),
  );
}

export interface BarLabel {
  readonly key: string;
  readonly label?: string;
}

export function BarLabels({
  bars,
  width,
  anchor = 'start',
}: {
  readonly bars: readonly BarLabel[];
  readonly width: number;
  readonly anchor?: 'start' | 'end';
}): ReactNode {
  const places = barLabelPlacesOf(
    bars.map((bar) => bar.label),
    width,
    anchor,
  );
  return (
    <View className="h-4">
      {places.map((place) => {
        const bar = bars[place.index];
        if (bar?.label === undefined)
          throw new Error(`Bar label ${String(place.index)} is missing`);
        return (
          <View
            key={bar.key}
            className="absolute top-0"
            style={{ left: place.left, width: place.width }}
          >
            <Text
              variant="caption"
              tone="variant"
              align={place.align}
              numberOfLines={1}
              className="tabular"
            >
              {bar.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
