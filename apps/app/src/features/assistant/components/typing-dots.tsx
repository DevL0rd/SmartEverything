import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAnimationGate } from '../../../design/animation-gate';
import { cn } from '../../../design/cn';
import { BLINK, EASE_IN_OUT, loopStyle } from '../../../design/loops';
import { useScreenPaused } from '../../../design/screen-pause';
import { useScopeVisible } from '../../../design/visibility';

const DELAYS = [0, 180, 360] as const;

export function TypingDots({
  moving = true,
  tone = 'variant',
}: {
  readonly moving?: boolean;
  readonly tone?: 'variant' | 'primary' | 'critical';
}): ReactNode {
  const paused = useScreenPaused();
  const gate = useAnimationGate(moving, useScopeVisible());
  const running = gate.moving && !paused;
  return (
    <View accessibilityLabel="Typing" className="h-4 flex-row items-center gap-1">
      {DELAYS.map((delay) => (
        <Animated.View
          key={delay}
          style={loopStyle({ name: BLINK, ms: 1100, easing: EASE_IN_OUT, delay }, running)}
          className={cn(
            'size-1.5 rounded-full',
            { primary: 'bg-primary', variant: 'bg-on-surface-variant', critical: 'bg-critical' }[
              tone
            ],
          )}
        />
      ))}
    </View>
  );
}
