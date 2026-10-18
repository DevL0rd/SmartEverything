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

export function useDraw(target: number, enabled: boolean): SharedValue<number> {
  const paused = useScreenPaused();
  const drawn = useSharedValue(enabled ? 0 : target);
  useEffect(() => {
    if (paused) {
      cancelAnimation(drawn);
      return;
    }
    drawn.set(enabled ? withTiming(target, { duration: DRAW_MS, easing: EASE_OUT }) : target);
  }, [drawn, target, enabled, paused]);
  return drawn;
}
