import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Path } from 'react-native-svg';
import { Text } from '../text';
import { barPath, type BarBox, type BarRadii } from './bar-path';
import { thinned } from './scale';

export interface BarShape extends BarBox {
  readonly key: string;
  readonly radii: BarRadii;
  readonly opacity: number;
  readonly fill?: string;
  readonly grow?: SharedValue<number>;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
export const BAR_STUB = 3;
const LABEL_GAP = 40;

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
}: {
  readonly bars: readonly BarLabel[];
  readonly width: number;
}): ReactNode {
  const shown = new Set(thinned(bars, width, LABEL_GAP).map((bar) => bar.key));
  return (
    <View className="flex-row">
      {bars.map((bar) => (
        <View key={bar.key} className="flex-1 items-center">
          {shown.has(bar.key) && bar.label !== undefined ? (
            <Text variant="caption" tone="faint" numberOfLines={1} className="tabular">
              {bar.label}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
