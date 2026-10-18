import { Easing, useReducedMotion, type EntryOrExitLayoutType } from 'react-native-reanimated';
import { useThemeSetting } from './theme';

export const DURATION = { fast: 100, short: 150, medium: 250, mediumOut: 200, long: 400 } as const;

export const EASING = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  fade: Easing.bezier(0.3, 0.1, 0.4, 1),
  accelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

export const SPRING = { damping: 22, stiffness: 240, mass: 1 } as const;

export interface MotionPreference {
  readonly reduced: boolean;
}

export function useMotion(): MotionPreference {
  const system = useReducedMotion();
  const motion = useThemeSetting('motion');
  if (motion === 'system') {
    return { reduced: system };
  }
  return { reduced: motion === 'reduced' };
}

export function entering(
  motion: MotionPreference,
  animation: EntryOrExitLayoutType,
): { readonly entering?: EntryOrExitLayoutType } {
  return motion.reduced ? {} : { entering: animation };
}

export function exiting(
  motion: MotionPreference,
  animation: EntryOrExitLayoutType,
): { readonly exiting?: EntryOrExitLayoutType } {
  return motion.reduced ? {} : { exiting: animation };
}
