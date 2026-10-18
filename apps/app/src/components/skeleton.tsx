import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../design/cn';
import { useAnimationGate } from '../design/animation-gate';
import { isNative } from '../design/platform';

type SkeletonShape = 'text' | 'line' | 'block' | 'circle' | 'tile';

const SHAPE: Readonly<Record<SkeletonShape, string>> = {
  text: 'h-3 w-32 rounded-xs',
  line: 'h-4 w-full rounded-xs',
  block: 'h-24 w-full rounded-md',
  circle: 'size-10 rounded-full',
  tile: 'h-32 w-full rounded-lg',
};

const SHIMMER_MS = 1200;

interface SkeletonProps {
  readonly shape?: SkeletonShape;
  readonly className?: string;
}

function skeletonClass({ shape = 'line', className }: SkeletonProps): string {
  return cn('bg-surface-3', SHAPE[shape], className);
}

function StillSkeleton(props: SkeletonProps): ReactNode {
  return <View aria-hidden className={skeletonClass(props)} />;
}

function ShimmerSkeleton(props: SkeletonProps): ReactNode {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.5, { duration: SHIMMER_MS / 2 }), -1, true));
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View aria-hidden style={style} className={skeletonClass(props)} />;
}

function WebSkeleton(props: SkeletonProps): ReactNode {
  const { moving } = useAnimationGate(true, true);
  return moving ? <ShimmerSkeleton {...props} /> : <StillSkeleton {...props} />;
}

export function Skeleton(props: SkeletonProps): ReactNode {
  return isNative() ? <StillSkeleton {...props} /> : <WebSkeleton {...props} />;
}
