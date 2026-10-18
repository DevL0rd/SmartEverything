import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useAnimationGate } from '../../../../design/animation-gate';
import { cn } from '../../../../design/cn';
import type { CallPhase } from '../call-state';
import {
  HISTORY_STEP_MS,
  WAVE_BARS,
  emptyHistory,
  liveHeights,
  pushLevel,
  smoothLevel,
  stillHeights,
  waveModeOf,
  waveMoves,
  type WaveMode,
} from '../model/call-wave';

const MS_PER_SECOND = 1000;

const TONE = {
  muted: 'bg-on-surface-faint/40',
  listening: 'bg-viz-1/55 dark:bg-viz-1/70',
  voice: 'bg-primary/55 dark:bg-primary/70',
} as const;

export interface CallWaveProps {
  readonly phase: CallPhase;
  readonly level: SharedValue<number>;
  readonly muted: boolean;
  readonly compact?: boolean;
}

function toneOf(mode: WaveMode, muted: boolean): string {
  if (mode === 'listening') {
    return muted ? TONE.muted : TONE.listening;
  }
  return TONE.voice;
}

function Bar({
  index,
  heights,
  className,
}: {
  readonly index: number;
  readonly heights: SharedValue<readonly number[]>;
  readonly className: string;
}): ReactNode {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: heights.get()[index] ?? 0 }] }));
  return <Animated.View style={style} className={cn('h-full w-0.75 rounded-full', className)} />;
}

function useWaveHeights(
  mode: WaveMode,
  muted: boolean,
  level: SharedValue<number>,
): SharedValue<readonly number[]> {
  const heights = useSharedValue<readonly number[]>(stillHeights(mode, muted));
  const history = useSharedValue<readonly number[]>(emptyHistory());
  const smoothed = useSharedValue(0);
  const seconds = useSharedValue(0);
  const sinceStep = useSharedValue(0);
  const { moving } = useAnimationGate(waveMoves(mode, muted), true);
  const frame = useFrameCallback((info) => {
    'worklet';
    const elapsed = info.timeSincePreviousFrame ?? 0;
    const live = mode === 'speaking' || mode === 'listening';
    smoothed.set(smoothLevel(smoothed.get(), live ? level.get() : 0, elapsed));
    seconds.set(seconds.get() + elapsed / MS_PER_SECOND);
    sinceStep.set(sinceStep.get() + elapsed);
    if (sinceStep.get() >= HISTORY_STEP_MS) {
      sinceStep.set(sinceStep.get() - HISTORY_STEP_MS);
      history.set(pushLevel(history.get(), smoothed.get()));
    }
    heights.set(liveHeights(mode, history.get(), seconds.get()));
  }, false);
  useEffect(() => {
    history.set(emptyHistory());
    smoothed.set(0);
    sinceStep.set(0);
    if (!moving) {
      heights.set(stillHeights(mode, muted));
    }
    frame.setActive(moving);
    return (): void => {
      frame.setActive(false);
    };
  }, [moving, mode, muted, frame, heights, history, smoothed, sinceStep]);
  return heights;
}

export function CallWave({ phase, level, muted, compact = false }: CallWaveProps): ReactNode {
  const mode = waveModeOf(phase);
  const heights = useWaveHeights(mode, muted, level);
  const className = toneOf(mode, muted);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('flex-row items-center gap-0.75', compact ? 'h-6' : 'h-10')}
    >
      {Array.from({ length: WAVE_BARS }, (_, index) => (
        <Bar key={index} index={index} heights={heights} className={className} />
      ))}
    </View>
  );
}
