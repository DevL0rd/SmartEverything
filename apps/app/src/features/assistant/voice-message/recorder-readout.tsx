import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Glow } from '../../../components/glow';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { playTime } from '../../../format/time';

const ORB_REST = 0.86;
const ORB_REACH = 0.26;
const ORB_DIM = 0.35;
const DOT_REST = 0.85;
const DOT_REACH = 0.3;
const LOUD = 0.75;
const RIPPLE_MS = 2400;
const RIPPLE_GROWTH = 1.5;
const RIPPLE_OPACITY = 0.9;
const RIPPLE_EASING = Easing.bezier(0.2, 0.6, 0.3, 1);
const RIPPLES = [0, 1, 2] as const;

export type ReadoutState = 'live' | 'paused' | 'waiting';

export interface ReadoutProps {
  readonly level: SharedValue<number>;
  readonly seconds: number;
  readonly state: ReadoutState;
  readonly reduced: boolean;
}

function Orb({
  level,
  dim,
}: {
  readonly level: SharedValue<number>;
  readonly dim: boolean;
}): ReactNode {
  const breathe = useAnimatedStyle(() => ({
    opacity: dim ? ORB_DIM : ORB_REST + (1 - ORB_REST) * level.get(),
    transform: [{ scale: ORB_REST + ORB_REACH * level.get() }],
  }));
  return (
    <Animated.View pointerEvents="none" style={breathe} className="absolute size-28 self-center">
      <Glow colour="critical" x="50%" y="50%" radius="50%" strength={0.34} />
    </Animated.View>
  );
}

function Ripple({ progress }: { readonly progress: SharedValue<number> }): ReactNode {
  const grow = useAnimatedStyle(() => ({
    opacity: progress.get() >= 1 ? 0 : RIPPLE_OPACITY * (1 - progress.get()),
    transform: [{ scale: 1 + RIPPLE_GROWTH * progress.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={grow}
      className="absolute -left-px -top-px size-3 rounded-full border border-critical/55"
    />
  );
}

function useRipples(level: SharedValue<number>): readonly SharedValue<number>[] {
  const first = useSharedValue(1);
  const second = useSharedValue(1);
  const third = useSharedValue(1);
  const loud = useSharedValue(false);
  const next = useSharedValue(0);
  useAnimatedReaction(
    () => level.get() >= LOUD,
    (now) => {
      if (now && !loud.get()) {
        const slot = [first, second, third][next.get() % RIPPLES.length];
        slot?.set(0);
        slot?.set(withTiming(1, { duration: RIPPLE_MS, easing: RIPPLE_EASING }));
        next.set(next.get() + 1);
      }
      loud.set(now);
    },
  );
  return [first, second, third];
}

function RecordingDot({ level, state, reduced }: Omit<ReadoutProps, 'seconds'>): ReactNode {
  const ripples = useRipples(level);
  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: state === 'live' ? DOT_REST + DOT_REACH * level.get() : 1 }],
  }));
  return (
    <View className="relative size-2.5">
      {reduced || state !== 'live'
        ? null
        : ripples.map((progress, index) => <Ripple key={RIPPLES[index]} progress={progress} />)}
      <Animated.View
        style={pulse}
        className={cn('size-2.5', state === 'live' ? null : 'opacity-40')}
      >
        <View className="absolute -inset-1 rounded-full bg-critical/22" />
        <View className="absolute inset-0 rounded-full bg-critical" />
      </Animated.View>
    </View>
  );
}

export function RecorderReadout({ level, seconds, state, reduced }: ReadoutProps): ReactNode {
  return (
    <View className="relative h-16 items-center justify-center">
      {reduced || state === 'paused' ? null : <Orb level={level} dim={state === 'waiting'} />}
      <View className="flex-row items-center gap-3.5">
        <RecordingDot level={level} state={state} reduced={reduced} />
        <Text
          aria-live="polite"
          tone={state === 'live' ? 'default' : 'variant'}
          className="tabular font-sans-medium text-figure-m tracking-tight"
        >
          {playTime(seconds)}
        </Text>
      </View>
    </View>
  );
}
