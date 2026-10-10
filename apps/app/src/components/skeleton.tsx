import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../design/cn';
import { useMotion } from '../design/motion';
import { isNative } from '../design/platform';

export type SkeletonShape = 'text' | 'line' | 'block' | 'circle' | 'tile';

const SHAPE: Readonly<Record<SkeletonShape, string>> = {
  text: 'h-3 w-32 rounded-xs',
  line: 'h-4 w-full rounded-xs',
  block: 'h-24 w-full rounded-md',
  circle: 'size-10 rounded-full',
  tile: 'h-32 w-full rounded-lg',
};

const SHIMMER_MS = 1200;

export function Skeleton({
  shape = 'line',
  className,
}: {
  readonly shape?: SkeletonShape;
  readonly className?: string;
}): ReactNode {
  const { reduced } = useMotion();
  const animate = !reduced && !isNative();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (animate) {
      opacity.set(withRepeat(withTiming(0.5, { duration: SHIMMER_MS / 2 }), -1, true));
    }
  }, [animate, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      aria-hidden
      style={style}
      className={cn('bg-surface-3', SHAPE[shape], className)}
    />
  );
}
