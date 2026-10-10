import {
  FadeOut,
  Keyframe,
  LinearTransition,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { DURATION, EASING, SPRING } from '../../../design/motion';

const FRESH_MS = 5000;

const PULSE_FROM_SCALE = 0.6;

export const ROW_REORDER = LinearTransition.duration(DURATION.medium).easing(EASING.standard);

export const ROW_EXIT = FadeOut.duration(DURATION.short);

export const HOVER_BAR = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 4 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASING.standard },
}).duration(DURATION.fast);

export const UNREAD_PULSE: EntryExitAnimationFunction = (_values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: PULSE_FROM_SCALE }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.fast }),
      transform: [{ scale: withSpring(1, SPRING) }],
    },
  };
};

export function arrivedJustNow(at: string): boolean {
  return Date.now() - Date.parse(at) < FRESH_MS;
}
