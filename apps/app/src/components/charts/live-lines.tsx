import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ChartSeries, Model } from './chart-model';
import { SECOND_MS, slideStep } from './live-window';
import { areaPath, linePath, type Drawn } from './scale';

const LINE_WIDTH = 2;
const FILL_OPACITY = 0.12;
const STACK_FILL_OPACITY = 0.28;
const CLIP_BLEED = 2;

function useSlide(
  step: number,
  now: number,
  moving: boolean,
): ReturnType<typeof useAnimatedStyle<ViewStyle>> {
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!moving) {
      cancelAnimation(offset);
      offset.set(0);
      return;
    }
    offset.set(
      withSequence(
        withTiming(step, { duration: 0 }),
        withTiming(0, { duration: SECOND_MS, easing: Easing.linear }),
      ),
    );
  }, [offset, step, now, moving]);
  return useAnimatedStyle<ViewStyle>(() => ({ transform: [{ translateX: offset.get() }] }));
}

function Lines({
  drawn,
  model,
  fill,
  floor,
  opacity,
}: {
  readonly drawn: Drawn<ChartSeries>;
  readonly model: Model;
  readonly fill: boolean;
  readonly floor: number;
  readonly opacity: number;
}): ReactNode {
  const stroke = useColour(drawn.series.colour);
  return drawn.segments.map((segment) => {
    const placed = segment.map((point) => ({ x: model.x(point.t), y: model.y(point.v) }));
    const [head] = placed;
    if (head === undefined) {
      return null;
    }
    if (placed.length === 1) {
      return null;
    }
    return [
      fill ? (
        <Path
          key={`area-${String(head.x)}`}
          d={areaPath(placed, model.y(floor))}
          fill={stroke}
          fillOpacity={opacity}
        />
      ) : null,
      <Path
        key={`line-${String(head.x)}`}
        d={linePath(placed)}
        fill="none"
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />,
    ];
  });
}

export function SlidingLines({
  model,
  stack,
  area,
  now,
  spanMs,
  moving,
}: {
  readonly model: Model;
  readonly stack: boolean;
  readonly area: boolean;
  readonly now: number;
  readonly spanMs: number;
  readonly moving: boolean;
}): ReactNode {
  const { box } = model;
  const width = box.right - box.left;
  const slide = useSlide(slideStep(width, spanMs), now, moving);
  const frame = {
    left: box.left,
    top: box.top - CLIP_BLEED,
    width,
    height: box.bottom - box.top + 2 * CLIP_BLEED,
  };
  const base = model.yTicks[0] ?? 0;
  return (
    <View pointerEvents="none" style={frame} className="absolute overflow-hidden">
      <Animated.View style={slide}>
        <Svg
          width={frame.width}
          height={frame.height}
          viewBox={`${String(frame.left)} ${String(frame.top)} ${String(frame.width)} ${String(frame.height)}`}
        >
          {model.drawn.map((drawn, index) => (
            <Lines
              key={drawn.series.label}
              drawn={drawn}
              model={model}
              fill={area ? index === 0 || stack : false}
              floor={stack && index > 0 ? 0 : base}
              opacity={stack ? STACK_FILL_OPACITY : FILL_OPACITY}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
