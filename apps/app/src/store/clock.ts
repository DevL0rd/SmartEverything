import { useRef } from 'react';
import { AppState } from 'react-native';
import { dayKeyOf } from '../format/time';
import { ValueStore, usePausable, useValue } from '../design/external-store';

const minute = new ValueStore<number>(Date.now());

let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  const now = Date.now();
  minute.set(now);
  timer = setTimeout(schedule, 60_000 - (now % 60_000) + 50);
}

function pause(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

export function startClock(): () => void {
  schedule();
  const appState = AppState.addEventListener('change', (state) => {
    pause();
    if (state === 'active') {
      schedule();
    }
  });
  return (): void => {
    appState.remove();
    pause();
  };
}

export function useMinute(): number {
  return useValue(minute);
}

export function readMinute(): number {
  return minute.get();
}

export function heldSelection<T>(
  held: { readonly value: T } | null,
  next: T,
  same: (left: T, right: T) => boolean,
): { readonly value: T } {
  return held !== null && same(held.value, next) ? held : { value: next };
}

export function useMinuteOf<T>(
  select: (now: number) => T,
  same: (left: T, right: T) => boolean = Object.is,
): T {
  const held = useRef<{ readonly value: T } | null>(null);
  return usePausable(minute.subscribe, () => {
    held.current = heldSelection(held.current, select(minute.get()), same);
    return held.current.value;
  });
}

export function useDayKey(): string {
  return usePausable(minute.subscribe, () => dayKeyOf(minute.get()));
}

const second = new ValueStore<number>(Date.now());

let secondTimer: ReturnType<typeof setInterval> | null = null;

let secondUsers = 0;

function followSecond(listener: () => void): () => void {
  const stop = second.subscribe(listener);
  secondUsers += 1;
  if (secondTimer === null) {
    second.set(Date.now());
    secondTimer = setInterval(() => {
      second.set(Date.now());
    }, 1000);
  }
  return (): void => {
    stop();
    secondUsers -= 1;
    if (secondUsers === 0 && secondTimer !== null) {
      clearInterval(secondTimer);
      secondTimer = null;
    }
  };
}

const SECOND_MS = 1000;

export function readSecond(): number {
  return secondTimer === null ? Math.floor(Date.now() / SECOND_MS) * SECOND_MS : second.get();
}

function noSeconds(): () => void {
  return (): void => undefined;
}

export function useSecondOf<T extends string | number | boolean | null>(
  select: (now: number) => T,
  ticking = true,
): T {
  return usePausable(ticking ? followSecond : noSeconds, () => select(readSecond()));
}
