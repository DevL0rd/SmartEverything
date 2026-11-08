import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ViewStyle } from 'react-native';
import { useMotion } from '../../../design/motion';

export type SwipeChoice = 'previous' | 'next' | 'close';

export const SWIPE_STEP_SHARE = 0.25;
export const SWIPE_CLOSE_SHARE = 0.2;
export const SWIPE_FLING = 800;
const ACTIVE_OFFSET = 12;

export interface SwipeMove {
  readonly dx: number;
  readonly dy: number;
  readonly vx: number;
  readonly vy: number;
  readonly width: number;
  readonly height: number;
}

export function swipeChoiceOf(move: SwipeMove): SwipeChoice | null {
  'worklet';
  const sideways = Math.abs(move.dx) > Math.abs(move.dy);
  if (!sideways) {
    const far = move.dy > move.height * SWIPE_CLOSE_SHARE || move.vy > SWIPE_FLING;
    return move.dy > 0 && far ? 'close' : null;
  }
  const far = Math.abs(move.dx) > move.width * SWIPE_STEP_SHARE || Math.abs(move.vx) > SWIPE_FLING;
  if (!far) return null;
  return move.dx < 0 ? 'next' : 'previous';
}

export interface Swipe {
  readonly gesture: PanGesture;
  readonly style: AnimatedStyle<ViewStyle>;
  readonly measure: (width: number, height: number) => void;
}

export function useSwipe(enabled: boolean, onChoice: (choice: SwipeChoice) => void): Swipe {
  const { reduced } = useMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const size = useSharedValue({ width: 1, height: 1 });
  const settle = (value: number): number => {
    'worklet';
    return reduced ? value : withTiming(value);
  };
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .activeOffsetX([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .activeOffsetY([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .onUpdate((event) => {
      const sideways = Math.abs(event.translationX) > Math.abs(event.translationY);
      x.set(sideways ? event.translationX : 0);
      y.set(sideways ? 0 : Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      const choice = swipeChoiceOf({
        dx: event.translationX,
        dy: event.translationY,
        vx: event.velocityX,
        vy: event.velocityY,
        ...size.get(),
      });
      x.set(settle(0));
      y.set(settle(0));
      if (choice !== null) scheduleOnRN(onChoice, choice);
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
    opacity: 1 - Math.min(0.5, y.get() / Math.max(1, size.get().height)),
  }));
  return {
    gesture,
    style,
    measure: (width, height): void => {
      size.set({ width, height });
    },
  };
}
