import { useId, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import {
  NO_BARS,
  liveBarCount,
  liveWavePath,
  pushLevel,
  type LiveBars,
  type LiveWaveShape,
} from './recorder-wave-model';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const NEWEST = 1;
const TRAIL = 3;
const FADE_END = 0.22;
const REST_OPACITY = 0.55;
const TRAIL_OPACITY = 0.7;

export interface LiveWaveProps {
  readonly level: SharedValue<number>;
  readonly elapsedMs: SharedValue<number>;
  readonly shape: LiveWaveShape;
  readonly fade: boolean;
  readonly className: string;
}

interface ArtProps extends LiveWaveProps {
  readonly width: number;
  readonly count: number;
}

function useLiveBars(
  level: SharedValue<number>,
  elapsedMs: SharedValue<number>,
  count: number,
): SharedValue<LiveBars> {
  const state = useSharedValue(NO_BARS);
  useAnimatedReaction(
    () => elapsedMs.get(),
    (elapsed) => {
      const current = state.get();
      const next = pushLevel(current, count, elapsed, level.get());
      if (next !== current) state.set(next);
    },
    [count],
  );
  return state;
}

function WaveArt({ level, elapsedMs, shape, fade, width, count }: ArtProps): ReactNode {
  const state = useLiveBars(level, elapsedMs, count);
  const variant = useColour('on-surface-variant');
  const critical = useColour('critical');
  const fadeId = `live-wave-${useId().replaceAll(':', '')}`;
  const older = useAnimatedProps(() => {
    const all = state.get().bars;
    return { d: liveWavePath(all, count, { from: 0, to: all.length - TRAIL }, shape) };
  }, [count, shape]);
  const trail = useAnimatedProps(() => {
    const all = state.get().bars;
    const span = { from: all.length - TRAIL, to: all.length - NEWEST };
    return { d: liveWavePath(all, count, span, shape) };
  }, [count, shape]);
  const newest = useAnimatedProps(() => {
    const all = state.get().bars;
    return { d: liveWavePath(all, count, { from: all.length - NEWEST, to: all.length }, shape) };
  }, [count, shape]);
  return (
    <Svg width={width} height={shape.height} pointerEvents="none" aria-hidden>
      <Defs>
        <LinearGradient
          id={fadeId}
          x1="0"
          y1="0"
          x2={String(width)}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={variant} stopOpacity={fade ? 0 : REST_OPACITY} />
          <Stop offset={String(FADE_END)} stopColor={variant} stopOpacity={REST_OPACITY} />
          <Stop offset="1" stopColor={variant} stopOpacity={REST_OPACITY} />
        </LinearGradient>
      </Defs>
      <AnimatedPath animatedProps={older} fill={`url(#${fadeId})`} />
      <AnimatedPath animatedProps={trail} fill={critical} fillOpacity={TRAIL_OPACITY} />
      <AnimatedPath animatedProps={newest} fill={critical} />
    </Svg>
  );
}

export function LiveWave(props: LiveWaveProps): ReactNode {
  const [width, setWidth] = useState(0);
  const count = liveBarCount(width, props.shape);
  return (
    <View
      aria-hidden
      className={cn('min-w-0 justify-center', props.className)}
      onLayout={(event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {count > 0 ? <WaveArt {...props} width={width} count={count} /> : null}
    </View>
  );
}
