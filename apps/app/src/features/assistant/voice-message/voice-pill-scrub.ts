import { useState } from 'react';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { LEVEL_SLOP, swallowNextClick } from '../../../components/level-math';
import { isNative } from '../../../design/platform';
import { lightTap } from '../../../platform/haptics';
import { shareAt, tenthOf } from './voice-pill-wave';

export const NOT_SCRUBBING = -1;

export interface WaveScrub {
  readonly gesture: ComposedGesture;
  readonly scrub: SharedValue<number>;
  readonly label: number | null;
}

interface ScrubTarget {
  readonly width: number;
  readonly duration: number;
  readonly enabled: boolean;
  readonly seek: (seconds: number) => void;
}

function panOf(
  enabled: boolean,
  begin: (x: number) => void,
  move: (x: number) => void,
  finish: (commit: boolean) => void,
): ReturnType<typeof Gesture.Pan> {
  return Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled)
    .activeOffsetX([-LEVEL_SLOP, LEVEL_SLOP])
    .failOffsetY([-LEVEL_SLOP, LEVEL_SLOP])
    .onStart((event) => {
      begin(event.x);
    })
    .onUpdate((event) => {
      move(event.x);
    })
    .onEnd(() => {
      finish(true);
    })
    .onFinalize(() => {
      finish(false);
    });
}

function tapOf(enabled: boolean, jump: (x: number) => void): ReturnType<typeof Gesture.Tap> {
  return Gesture.Tap()
    .runOnJS(true)
    .enabled(enabled)
    .maxDistance(LEVEL_SLOP)
    .onEnd((event, success) => {
      if (success) jump(event.x);
    });
}

export function useWaveScrub({ width, duration, enabled, seek }: ScrubTarget): WaveScrub {
  const scrub = useSharedValue(NOT_SCRUBBING);
  const [label, setLabel] = useState<number | null>(null);
  const show = (share: number): void => {
    scrub.set(share);
    setLabel(Math.floor(share * duration));
  };
  const begin = (x: number): void => {
    if (!isNative()) swallowNextClick(document);
    lightTap();
    show(shareAt(x, width));
  };
  const move = (x: number): void => {
    const share = shareAt(x, width);
    if (tenthOf(share) !== tenthOf(scrub.get())) lightTap();
    show(share);
  };
  const finish = (commit: boolean): void => {
    const share = scrub.get();
    if (share === NOT_SCRUBBING) return;
    if (commit) seek(share * duration);
    scrub.set(NOT_SCRUBBING);
    setLabel(null);
  };
  const jump = (x: number): void => {
    seek(shareAt(x, width) * duration);
  };
  const gesture = Gesture.Exclusive(panOf(enabled, begin, move, finish), tapOf(enabled, jump));
  return { gesture, scrub, label };
}
