import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { percentOf } from '../../../components/charts/stage-timeline';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';

export type GlassSize = 'm' | 'l';

const FRAME: Readonly<Record<GlassSize, string>> = {
  m: 'h-14 w-10 rounded-b-lg',
  l: 'h-20 w-14 rounded-b-xl',
};

export function WaterGlass({
  progress,
  size,
}: {
  readonly progress: number;
  readonly size: GlassSize;
}): ReactNode {
  const { reduced } = useMotion();
  const share = Math.min(1, Math.max(0, progress));
  const fill = useAnimatedStyle(() => ({
    height: reduced
      ? percentOf(share)
      : withTiming(percentOf(share), { duration: DURATION.medium, easing: EASING.decelerate }),
  }));
  return (
    <View
      aria-hidden
      className={cn(
        'justify-end overflow-hidden border-2 border-humidity bg-humidity/10',
        FRAME[size],
      )}
    >
      <Animated.View style={fill} className="w-full bg-humidity">
        <View className="h-1 w-full bg-white/30" />
      </Animated.View>
    </View>
  );
}
