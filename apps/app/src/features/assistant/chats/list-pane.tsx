import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';

export const PANEL_SLIDE = LinearTransition.duration(DURATION.medium).easing(EASING.standard);

export function ListPane({
  open,
  children,
}: {
  readonly open: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { reduced } = useMotion();
  const visible = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    const target = open ? 1 : 0;
    visible.set(
      reduced ? target : withTiming(target, { duration: DURATION.medium, easing: EASING.standard }),
    );
  }, [open, reduced, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: visible.get() }));
  return (
    <Animated.View
      {...(reduced ? {} : { layout: PANEL_SLIDE })}
      aria-hidden={!open}
      className={cn('overflow-hidden border-outline-variant', open ? 'w-master border-r' : 'w-0')}
    >
      <Animated.View
        style={fade}
        pointerEvents={open ? 'auto' : 'none'}
        className="w-master min-h-0 flex-1 pt-safe"
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
