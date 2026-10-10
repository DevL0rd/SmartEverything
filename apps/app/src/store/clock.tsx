import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ClockTextView } from '../components/time-text';
import type { TextVariant } from '../components/text';
import type { Tone } from '../components/tone';
import { ValueStore, useValue } from '../design/external-store';

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

export function useSecond(): number {
  return useSyncExternalStore(followSecond, second.get, second.get);
}

interface TimeProps {
  readonly at: Date | string;
  readonly variant?: TextVariant;
  readonly tone?: Tone;
}

export function ClockText(props: TimeProps & { readonly timeZone: string | null }): ReactNode {
  return <ClockTextView {...props} />;
}
