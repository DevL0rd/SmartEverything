import { useEffect } from 'react';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { ASSISTANT_LEVEL_MAX } from '@smarteverything/domain';
import { SPRING } from '../../../design/motion';
import { useAnimationGate } from '../../../design/animation-gate';

export const LEVEL_STEP_MS = 50;
export const BAR_PX = 2;
export const BAR_GAP_PX = 1;

export function barCountFor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(0, Math.floor((width + BAR_GAP_PX) / (BAR_PX + BAR_GAP_PX)));
}

export function resampleLevels(levels: readonly number[], count: number): readonly number[] {
  if (count <= 0 || levels.length === 0) return [];
  return Array.from({ length: count }, (_, bar) => {
    const from = Math.floor((bar * levels.length) / count);
    const to = Math.max(from + 1, Math.floor(((bar + 1) * levels.length) / count));
    let peak = 0;
    for (let index = from; index < to; index += 1) {
      peak = Math.max(peak, levels[index] ?? 0);
    }
    return peak;
  });
}

export function levelAt(levels: readonly number[], seconds: number): number {
  'worklet';
  if (levels.length === 0 || !Number.isFinite(seconds)) return 0;
  const index = Math.floor((Math.max(0, seconds) * 1000) / LEVEL_STEP_MS);
  return (levels[Math.min(index, levels.length - 1)] ?? 0) / ASSISTANT_LEVEL_MAX;
}

export function usePlayheadLevel(
  levels: readonly number[],
  playhead: SharedValue<number>,
  playing: boolean,
  onScreen: boolean,
): SharedValue<number> {
  const { moving } = useAnimationGate(playing, onScreen);
  const live = useSharedValue(moving);
  useEffect(() => {
    live.set(moving);
  }, [live, moving]);
  return useDerivedValue(() =>
    withSpring(live.get() ? levelAt(levels, playhead.get()) : 0, SPRING),
  );
}
