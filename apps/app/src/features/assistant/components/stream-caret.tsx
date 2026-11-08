import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { useAnimationGate } from '../../../design/animation-gate';
import { BLINK, EASE_IN_OUT, loopStyle } from '../../../design/loops';
import { useScreenPaused } from '../../../design/screen-pause';
import { useScopeVisible } from '../../../design/visibility';

const BLINK_MS = 1000;

export function StreamCaret(): ReactNode {
  const paused = useScreenPaused();
  const gate = useAnimationGate(true, useScopeVisible());
  return (
    <Animated.View
      aria-hidden
      style={loopStyle({ name: BLINK, ms: BLINK_MS, easing: EASE_IN_OUT }, gate.moving && !paused)}
      className="ml-0.5 h-4.25 w-0.5 rounded-full bg-primary"
    />
  );
}
