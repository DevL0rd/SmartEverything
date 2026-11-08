import { useEffect, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Memory } from '@smarteverything/domain';
import { useScreenLive } from '../../../design/animation-gate';
import { isNative } from '../../../design/platform';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useMemoryItems, type MemoryMedia } from './items';
import {
  advance,
  playableTotal,
  playerKeyOf,
  SLIDE_MS,
  START,
  stepTo,
  toggle,
  type PlayerKey,
  type PlayerPosition,
} from './player-model';

export interface MemoryPlayerState {
  readonly position: PlayerPosition;
  readonly total: number;
  readonly current: MemoryMedia | null;
  readonly previous: MemoryMedia | null;
  readonly progress: SharedValue<number>;
  readonly step: (by: number) => void;
  readonly toggle: () => void;
  readonly hold: (held: boolean) => void;
}

function useSlideClock(
  progress: SharedValue<number>,
  moving: boolean,
  index: number,
  onEnd: () => void,
): void {
  useEffect(() => {
    if (!moving) return undefined;
    const remaining = Math.max(0, 1 - progress.get()) * SLIDE_MS;
    progress.set(
      withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
        if (finished === true) scheduleOnRN(onEnd);
      }),
    );
    return (): void => {
      cancelAnimation(progress);
    };
  }, [moving, index, onEnd, progress]);
}

function usePlayerKeys(open: boolean, onKey: (key: PlayerKey) => void): void {
  useEffect(() => {
    if (!open || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      const key = playerKeyOf(event.key);
      if (key === null) return;
      event.preventDefault();
      onKey(key);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [open, onKey]);
}

export function useMemoryPlayer(memory: Memory, open: boolean): MemoryPlayerState {
  const media = useMemoryItems(memory.id);
  const [position, setPosition] = useState(START);
  const [held, setHeld] = useState(false);
  const progress = useSharedValue(0);
  const total = playableTotal(memory.count, media.items.length, media.more || media.loading);
  const current = media.items[position.index] ?? null;
  const live = useScreenLive();
  const playing =
    open && !position.paused && !held && current !== null && live.focused && live.foreground;
  const step = useStableCallback((by: number): void => {
    const next = stepTo(position, position.index + by, total);
    if (next === position) return;
    progress.set(0);
    setPosition(next);
  });
  const onEnd = useStableCallback((): void => {
    if (position.index < total - 1) progress.set(0);
    setPosition((now) => advance(now, total));
  });
  const flip = useStableCallback((): void => {
    if (position.ended) progress.set(0);
    setPosition(toggle);
  });
  const onKey = useStableCallback((key: PlayerKey): void => {
    if (key === 'toggle') flip();
    else step(key === 'next' ? 1 : -1);
  });
  useSlideClock(progress, playing, position.index, onEnd);
  usePlayerKeys(open, onKey);
  const { loadMore } = media;
  useEffect(() => {
    if (position.index + 1 >= media.items.length) loadMore();
  }, [position.index, media.items.length, loadMore]);
  return {
    position,
    total,
    current,
    previous: position.previous === null ? null : (media.items[position.previous] ?? null),
    progress,
    step,
    toggle: flip,
    hold: setHeld,
  };
}
