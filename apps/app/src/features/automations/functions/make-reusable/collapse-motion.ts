import { FadeIn, ZoomIn, type EntryOrExitLayoutType } from 'react-native-reanimated';
import { DURATION, EASING, type MotionPreference } from '../../../../design/motion';

export interface CollapseMotion {
  readonly kind: 'collapse' | 'crossfade';
  readonly duration: number;
}

export function collapseMotion(motion: MotionPreference): CollapseMotion {
  return motion.reduced
    ? { kind: 'crossfade', duration: DURATION.short }
    : { kind: 'collapse', duration: DURATION.long };
}

export function collapseEntering(motion: MotionPreference): EntryOrExitLayoutType {
  const { kind, duration } = collapseMotion(motion);
  return kind === 'crossfade'
    ? FadeIn.duration(duration)
    : ZoomIn.duration(duration).easing(EASING.decelerate);
}
