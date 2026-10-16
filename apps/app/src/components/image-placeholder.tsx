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
import { EASING } from '../design/motion';
import { useAnimationGate } from '../design/animation-gate';
import { useOnScreen } from '../design/visibility';
import { Glow } from './glow';
import { Icon } from './icon';

const SWEEP_MS = 2400;
const BAND_WIDTH = 0.6;
const SWEEP_DISTANCE = 1.6;

export function ImagePlaceholder({ active = true }: { readonly active?: boolean }): ReactNode {
  const ref = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(ref);
  const { moving: animate } = useAnimationGate(active, visible);
  const progress = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    progress.set(0);
    if (animate)
      progress.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: EASING.standard }), -1));
    return (): void => {
      cancelAnimation(progress);
    };
  }, [animate, progress]);
  const sweep = useAnimatedStyle(() => ({
    width: width.get() * BAND_WIDTH,
    transform: [{ translateX: width.get() * (progress.get() * SWEEP_DISTANCE - BAND_WIDTH) }],
  }));
  return (
    <View
      ref={ref}
      aria-hidden
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden bg-surface-2"
      onLayout={(event) => {
        onLayout?.();
        width.set(event.nativeEvent.layout.width);
      }}
    >
      <Glow colour="primary" x="10%" y="15%" radius="80%" strength={0.12} />
      <Glow colour="primary" x="90%" y="100%" radius="80%" strength={0.12} />
      {animate ? (
        <Animated.View style={sweep} className="absolute inset-y-0">
          <Glow colour="primary" x="50%" y="50%" radius="70%" strength={0.2} />
        </Animated.View>
      ) : null}
      <View className="size-full items-center justify-center">
        <View className="size-16 items-center justify-center rounded-2xl border border-primary/20 bg-surface-1/70">
          <Icon name="image" size={32} tone="primary" />
        </View>
      </View>
    </View>
  );
}
