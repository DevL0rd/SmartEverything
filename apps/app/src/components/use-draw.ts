import { useEffect } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useScreenPaused } from '../design/screen-pause';

const DRAW_MS = 700;
const EASE_OUT = Easing.out(Easing.cubic);

export function useDraw(target: number, enabled: boolean, ticking = false): SharedValue<number> {
  const paused = useScreenPaused();
  const drawn = useSharedValue(enabled ? 0 : target);
  const settled = useSharedValue(!enabled);
  useEffect(() => {
    if (paused) {
      cancelAnimation(drawn);
      return;
    }
    if (!enabled || (ticking && settled.get())) {
      drawn.set(target);
      return;
    }
    drawn.set(
      withTiming(target, { duration: DRAW_MS, easing: EASE_OUT }, (finished) => {
        if (finished === true) settled.set(true);
      }),
    );
  }, [drawn, settled, target, enabled, ticking, paused]);
  return drawn;
}
