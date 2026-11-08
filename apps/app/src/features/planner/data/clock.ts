import { useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { useVisibleLive, type VisibleLive } from '../../../design/use-visible-live';
import { useMinute, useMinuteOf } from '../../../store/clock';

export interface Visible<T> extends Pick<VisibleLive, 'onLayout'> {
  readonly value: T;
  readonly live: boolean;
}

export function heldWhile<T>(live: boolean, held: T, current: T): T {
  return live ? current : held;
}

function useHeld<T>(live: boolean, current: T): T {
  const [held, setHeld] = useState(current);
  if (live && !Object.is(held, current)) setHeld(current);
  return heldWhile(live, held, current);
}

export function useVisibleMinute(ref: RefObject<View | null>): Visible<number> {
  const { live, onLayout } = useVisibleLive(ref);
  return { value: useHeld(live, useMinute()), live, onLayout };
}

export function useVisibleMinuteOf<T>(
  ref: RefObject<View | null>,
  select: (now: number) => T,
  same: (left: T, right: T) => boolean = Object.is,
): Visible<T> {
  const { live, onLayout } = useVisibleLive(ref);
  return { value: useHeld(live, useMinuteOf(select, same)), live, onLayout };
}
