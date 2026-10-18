import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Glow } from '../../../../components/glow';
import { useMotion } from '../../../../design/motion';
import type { CallPhase } from '../call-state';
import { auraColourOf, auraOpacity, waveModeOf } from '../model/call-wave';

const AURA_STRENGTH = 0.5;

export interface CallAuraProps {
  readonly phase: CallPhase;
  readonly level: SharedValue<number>;
  readonly muted: boolean;
}

export function CallAura({ phase, level, muted }: CallAuraProps): ReactNode {
  const { reduced } = useMotion();
  const colour = auraColourOf(waveModeOf(phase), muted);
  const style = useAnimatedStyle(() => ({ opacity: auraOpacity(level.get(), muted, reduced) }));
  if (colour === null) {
    return null;
  }
  return (
    <Animated.View pointerEvents="none" style={style} className="absolute inset-0">
      <Glow colour={colour} y="40%" radius="55%" strength={AURA_STRENGTH} />
    </Animated.View>
  );
}
