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

interface ShapeClass {
  readonly width: string;
  readonly height: string;
  readonly radius: string;
}

const SHAPE: Readonly<Record<SkeletonShape, ShapeClass>> = {
  text: { width: 'w-32', height: 'h-3', radius: 'rounded-xs' },
  line: { width: 'w-full', height: 'h-4', radius: 'rounded-xs' },
  block: { width: 'w-full', height: 'h-24', radius: 'rounded-md' },
  circle: { width: 'w-10', height: 'h-10', radius: 'rounded-full' },
  tile: { width: 'w-full', height: 'h-32', radius: 'rounded-lg' },
};

const SETS_WIDTH = /(^|\s)(w|size)-/;
const SETS_HEIGHT = /(^|\s)(h|size)-/;
const SETS_RADIUS = /(^|\s)rounded(-|\s|$)/;

const SHIMMER_MS = 1200;

interface SkeletonProps {
  readonly shape?: SkeletonShape;
  readonly className?: string;
}

export function skeletonClass({ shape = 'line', className = '' }: SkeletonProps): string {
  const base = SHAPE[shape];
  return cn(
    'bg-surface-3',
    !SETS_WIDTH.test(className) && base.width,
    !SETS_HEIGHT.test(className) && base.height,
    !SETS_RADIUS.test(className) && base.radius,
    className,
  );
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
