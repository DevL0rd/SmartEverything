import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { DURATION, useMotion } from '../../../design/motion';
import { bringIntoView } from '../../bring-into-view';
import { useScreen } from '../../screen-context';

const FADE_MS = DURATION.medium * 3;
const STILL_MS = 1500;
export function RevealRing({
  label,
  onDone,
}: {
  readonly label: string;
  readonly onDone: () => void;
}): ReactNode {
  const ref = useAnimatedRef<Animated.View>();
  const opacity = useSharedValue(1);
  const { reduced } = useMotion();
  const { scrollRef, scrollY } = useScreen();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scrollRef !== null) {
        scheduleOnUI(bringIntoView, ref, scrollRef, scrollY);
      }
    });
    if (reduced) {
      const timer = setTimeout(onDone, STILL_MS);
      return (): void => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }
    opacity.set(
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished === true) {
          scheduleOnRN(onDone);
        }
      }),
    );
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [reduced, onDone, opacity, ref, scrollRef, scrollY]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      ref={ref}
      pointerEvents="none"
      style={style}
      className="absolute inset-0 rounded-lg border-2 border-focus"
    />
  );
}
