import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { CallPhase } from '../call-state';
import { callEngine } from '../engine/engine';

export function useCallLevel(phase: CallPhase): SharedValue<number> {
  const level = useSharedValue(0);
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'speaking') {
      level.set(0);
      return undefined;
    }
    let frame = 0;
    const read = (): void => {
      level.set(phase === 'speaking' ? callEngine.outputLevel() : callEngine.inputLevel());
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [phase, level]);
  return level;
}
