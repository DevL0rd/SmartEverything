import { useState, type ComponentProps, type ReactNode } from 'react';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { useFocusedKeys } from '../../../components/focused-keys';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { BREATHE, EASE_IN_OUT, loopStyle, type Loop } from '../../../design/loops';
import { playTime } from '../../../format/time';
import { barCountFor } from './use-playhead-level';
import type { PillPhase } from './voice-pill-model';
import { NOT_SCRUBBING, useWaveScrub } from './voice-pill-scrub';
import { SWELL_GAIN, WAVE_HEIGHT, barHeights, playedBars, wavePath } from './voice-pill-wave';

export type WaveTone = 'mine' | 'theirs';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SEEK_SECONDS = 5;
const SHIMMER: Loop = { name: BREATHE, ms: 800, easing: EASE_IN_OUT, alternate: true };
const FAILED = { opacity: 0.45 } as const;

export interface WaveformProps {
  readonly levels: readonly number[];
  readonly duration: number;
  readonly position: number;
  readonly scrubbable: boolean;
  readonly playhead: SharedValue<number>;
  readonly level: SharedValue<number>;
  readonly tone: WaveTone;
  readonly phase: PillPhase;
  readonly onScreen: boolean;
  readonly seek: (seconds: number) => void;
}

interface ArtProps {
  readonly heights: readonly number[];
  readonly width: number;
  readonly shown: SharedValue<number>;
  readonly level: SharedValue<number>;
  readonly tone: WaveTone;
  readonly phase: PillPhase;
}

interface RestLook {
  readonly fill: string;
  readonly opacity: number;
}

function useRestLook(tone: WaveTone, phase: PillPhase): RestLook {
  const light = useUniwind().theme === 'light';
  const variant = useColour('on-surface-variant');
  const primary = useColour('primary');
  if (phase === 'loading') return { fill: variant, opacity: 0.2 };
  if (tone === 'mine' && !light) return { fill: primary, opacity: 0.32 };
  return { fill: variant, opacity: tone === 'mine' ? 0.38 : 0.42 };
}

function WaveArt({ heights, width, shown, level, tone, phase }: ArtProps): ReactNode {
  const played = useColour('primary');
  const rest = useRestLook(tone, phase);
  const count = heights.length;
  const playedProps = useAnimatedProps(() => {
    const at = playedBars(shown.get(), count);
    const swell = 1 + SWELL_GAIN * level.get();
    return { d: wavePath(heights, { from: 0, to: at, centre: at, swell }) };
  }, [heights, count]);
  const restProps = useAnimatedProps(() => {
    const at = playedBars(shown.get(), count);
    const swell = 1 + SWELL_GAIN * level.get();
    return { d: wavePath(heights, { from: at, to: count, centre: at, swell }) };
  }, [heights, count]);
  return (
    <Svg width={width} height={WAVE_HEIGHT} pointerEvents="none" aria-hidden>
      <AnimatedPath animatedProps={restProps} fill={rest.fill} fillOpacity={rest.opacity} />
      {phase === 'loading' ? null : <AnimatedPath animatedProps={playedProps} fill={played} />}
    </Svg>
  );
}

function ScrubLabel({
  seconds,
  scrub,
  width,
}: {
  readonly seconds: number;
  readonly scrub: SharedValue<number>;
  readonly width: number;
}): ReactNode {
  const place = useAnimatedStyle(() => ({ left: Math.max(0, scrub.get()) * width }), [width]);
  return (
    <Animated.View
      pointerEvents="none"
      style={place}
      className="absolute -top-7 -translate-x-1/2 rounded-sm bg-on-surface px-1.5 py-0.5"
    >
      <Text variant="caption" tone="inverse" className="tabular font-sans-semibold">
        {playTime(seconds)}
      </Text>
    </Animated.View>
  );
}

function clampTo(duration: number, seconds: number): number {
  return Math.max(0, Math.min(duration, seconds));
}

function useWaveKeys({
  scrubbable,
  duration,
  position,
  seek,
}: WaveformProps): ReturnType<typeof useFocusedKeys> {
  return useFocusedKeys(scrubbable, (key) => {
    if (key === 'Home') seek(0);
    else if (key === 'End') seek(duration);
    else if (key === 'ArrowLeft' || key === 'ArrowDown')
      seek(clampTo(duration, position - SEEK_SECONDS));
    else if (key === 'ArrowRight' || key === 'ArrowUp')
      seek(clampTo(duration, position + SEEK_SECONDS));
    else return false;
    return true;
  });
}

function useShown(
  scrub: SharedValue<number>,
  playhead: SharedValue<number>,
  duration: number,
): SharedValue<number> {
  return useDerivedValue(() => {
    const dragged = scrub.get();
    if (dragged !== NOT_SCRUBBING) return dragged;
    return duration > 0 ? playhead.get() / duration : 0;
  }, [duration]);
}

function frameStyle(
  phase: WaveformProps['phase'],
  onScreen: boolean,
): ComponentProps<typeof Animated.View>['style'] {
  return [phase === 'failed' ? FAILED : null, loopStyle(SHIMMER, phase === 'loading' && onScreen)];
}

function useWaveAction({
  scrubbable,
  duration,
  position,
  seek,
}: WaveformProps): (event: AccessibilityActionEvent) => void {
  return (event) => {
    if (!scrubbable) return;
    const step = event.nativeEvent.actionName === 'increment' ? SEEK_SECONDS : -SEEK_SECONDS;
    seek(clampTo(duration, position + step));
  };
}

export function ClipWaveform(props: WaveformProps): ReactNode {
  const { levels, duration, position, scrubbable, playhead, level, tone, phase, seek } = props;
  const [width, setWidth] = useState(0);
  const heights = barHeights(levels, barCountFor(width));
  const scrubbing = useWaveScrub({ width, duration, enabled: scrubbable, seek });
  const shown = useShown(scrubbing.scrub, playhead, duration);
  const keys = useWaveKeys(props);
  const onAction = useWaveAction(props);
  const now = clampTo(duration, position);
  return (
    <GestureDetector gesture={scrubbing.gesture} touchAction="pan-y">
      <Animated.View
        accessible
        focusable={scrubbable}
        {...keys}
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{
          min: 0,
          max: duration,
          now,
          text: `${playTime(now)} of ${playTime(duration)}`,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onLayout={(event: LayoutChangeEvent) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        style={frameStyle(phase, props.onScreen)}
        className="relative min-w-0 self-stretch flex-1 justify-center rounded-md focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        {width > 0 ? (
          <WaveArt
            heights={heights}
            width={width}
            shown={shown}
            level={level}
            tone={tone}
            phase={phase}
          />
        ) : null}
        {scrubbing.label === null ? null : (
          <ScrubLabel seconds={scrubbing.label} scrub={scrubbing.scrub} width={width} />
        )}
      </Animated.View>
    </GestureDetector>
  );
}
