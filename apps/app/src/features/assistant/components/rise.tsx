import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EASING, useMotion } from '../../../design/motion';

export function Rise({
  from,
  duration,
  delay = 0,
  className,
  children,
}: {
  readonly from: number;
  readonly duration: number;
  readonly delay?: number;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { reduced } = useMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    progress.set(
      reduced ? 1 : withDelay(delay, withTiming(1, { duration, easing: EASING.decelerate })),
    );
  }, [reduced, delay, duration, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * from }],
  }));
  return (
    <Animated.View style={style} {...(className === undefined ? {} : { className })}>
      {children}
    </Animated.View>
  );
}
