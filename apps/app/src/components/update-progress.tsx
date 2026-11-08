import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './text';
import { useAnimationGate } from '../design/animation-gate';
import { DURATION, EASING } from '../design/motion';
import { useScopeVisible } from '../design/visibility';
import { percent } from '../format/number';

export function progressPercent(progress: number): number {
  return Math.round(progress * 100);
}

export function UpdateProgress({ progress }: { readonly progress: number }): ReactNode {
  const now = progressPercent(progress);
  const gate = useAnimationGate(true, useScopeVisible());
  const width = useSharedValue(now);
  useEffect(() => {
    width.set(
      gate.moving ? withTiming(now, { duration: DURATION.medium, easing: EASING.standard }) : now,
    );
  }, [gate.moving, now, width]);
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: width.get() / 100 }],
    transformOrigin: 'left',
  }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Update download"
      accessibilityValue={{ min: 0, max: 100, now }}
      className="w-full flex-row items-center gap-3"
    >
      <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
        <Animated.View style={fill} className="h-full w-full bg-primary" />
      </View>
      <Text variant="footnote" tone="variant" className="min-w-10 text-right tabular-nums">
        {percent(now / 100)}
      </Text>
    </View>
  );
}
