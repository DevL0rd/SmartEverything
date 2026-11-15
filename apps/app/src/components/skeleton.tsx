import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { useOnScreenGate } from '../design/visibility';

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

function WebSkeleton(props: SkeletonProps): ReactNode {
  const ref = useRef<View>(null);
  const { moving, onLayout } = useOnScreenGate(ref, true);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!moving) {
      cancelAnimation(opacity);
      opacity.set(1);
      return undefined;
    }
    opacity.set(withRepeat(withTiming(0.5, { duration: SHIMMER_MS / 2 }), -1, true));
    return (): void => {
      cancelAnimation(opacity);
    };
  }, [moving, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      ref={ref}
      onLayout={onLayout}
      aria-hidden
      style={style}
      className={skeletonClass(props)}
    />
  );
}

export function Skeleton(props: SkeletonProps): ReactNode {
  return isNative() ? <StillSkeleton {...props} /> : <WebSkeleton {...props} />;
}
