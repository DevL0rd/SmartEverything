import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../../../design/cn';
import { DURATION, useMotion } from '../../../design/motion';

export type RingMotion = 'still' | 'level' | 'pulse';

const PULSE_MS = 900;

const TONE: Readonly<Record<'talk' | 'hear' | 'wait', string>> = {
  talk: 'bg-critical/24',
  hear: 'bg-primary/24',
  wait: 'bg-on-surface/10',
};

export interface VoiceRingProps {
  readonly motion: RingMotion;
  readonly level: number;
  readonly tone: keyof typeof TONE;
  readonly className: string;
}

export function VoiceRing({ motion, level, tone, className }: VoiceRingProps): ReactNode {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(scale);
    if (reduced || motion === 'still') {
      scale.set(withTiming(1, { duration: DURATION.short }));
    } else if (motion === 'pulse') {
      scale.set(withRepeat(withTiming(1.18, { duration: PULSE_MS }), -1, true));
    } else {
      scale.set(withTiming(1 + level * 0.35, { duration: DURATION.fast }));
    }
  }, [motion, level, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  if (motion === 'still') {
    return <View pointerEvents="none" className={cn('absolute rounded-full', className)} />;
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className={cn('absolute rounded-full', TONE[tone], className)}
    />
  );
}
