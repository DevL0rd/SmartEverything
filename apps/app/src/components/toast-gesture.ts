import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DURATION, EASING, SPRING, useMotion } from '../design/motion';
import type { Idiom } from '../design/tokens';
import { dismissToast, holdToast, releaseToast } from './toast-store';

const SWIPE_SHARE = 0.35;
const SWIPE_VELOCITY = 800;
const ACTIVATE = 10;
const VERTICAL = 12;
const RISE = 16;
const SWIPE_FADE = 0.6;

export interface ToastMotion {
  readonly gesture: ComposedGesture;
  readonly style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  readonly onWidth: (width: number) => void;
}

function settleSwipe(
  id: number,
  shift: SharedValue<number>,
  width: number,
  velocityX: number,
): void {
  'worklet';
  const far = Math.abs(shift.get()) > width * SWIPE_SHARE;
  if (!far && Math.abs(velocityX) < SWIPE_VELOCITY) {
    shift.set(withSpring(0, SPRING));
    return;
  }
  const side = (shift.get() === 0 ? velocityX : shift.get()) < 0 ? -1 : 1;
  shift.set(withTiming(side * width, { duration: DURATION.short, easing: EASING.accelerate }));
  scheduleOnRN(dismissToast, id);
}

function useToastGesture(
  id: number,
  idiom: Idiom,
  shift: SharedValue<number>,
  width: SharedValue<number>,
): ComposedGesture {
  const pan = Gesture.Pan()
    .enabled(idiom === 'touch')
    .activeOffsetX([-ACTIVATE, ACTIVATE])
    .failOffsetY([-VERTICAL, VERTICAL])
    .onBegin(() => {
      scheduleOnRN(holdToast, id, 'touch');
    })
    .onUpdate((event) => {
      shift.set(event.translationX);
    })
    .onEnd((event) => {
      settleSwipe(id, shift, width.get(), event.velocityX);
    })
    .onFinalize(() => {
      scheduleOnRN(releaseToast, id, 'touch');
    });
  const hover = Gesture.Hover()
    .onBegin(() => {
      scheduleOnRN(holdToast, id, 'hover');
    })
    .onFinalize(() => {
      scheduleOnRN(releaseToast, id, 'hover');
    });
  return Gesture.Simultaneous(pan, hover);
}

export function useToastMotion(id: number, leaving: boolean, idiom: Idiom): ToastMotion {
  const { reduced } = useMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  const shift = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    const target = leaving ? 0 : 1;
    const duration = leaving ? DURATION.short : DURATION.medium;
    const easing = leaving ? EASING.accelerate : EASING.decelerate;
    shown.set(reduced ? target : withTiming(target, { duration, easing }));
  }, [leaving, reduced, shown]);
  const style = useAnimatedStyle<ViewStyle>(() => {
    const travel = width.get() === 0 ? 0 : Math.min(Math.abs(shift.get()) / width.get(), 1);
    return {
      opacity: shown.get() * (1 - travel * SWIPE_FADE),
      transform: [{ translateX: shift.get() }, { translateY: (1 - shown.get()) * RISE }],
    };
  });
  return {
    gesture: useToastGesture(id, idiom, shift, width),
    style,
    onWidth: (next): void => {
      width.set(next);
    },
  };
}
