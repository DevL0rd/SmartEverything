import type { SignalMatcher } from './signal-matcher';
import { directionalTest, type SignalFirstPeriod } from './signal-timing';
import type { SignalWindowMode } from './signals';

export interface RearmBase {
  readonly side: 'below' | 'above';
  readonly threshold: number;
}

export interface SignalTiming {
  readonly window: { readonly of: SignalWindowMode; readonly seconds: number } | null;
  readonly atLeast: number;
  readonly debounceSeconds: number;
  readonly holdSeconds: number;
  readonly cooldownSeconds: number;
  readonly silentSeconds: number;
  readonly first: SignalFirstPeriod | null;
  readonly rearm: number | null;
  readonly rearmBase: RearmBase | null;
}

export const DEFAULT_COUNT_AT_LEAST = 2;

const WINDOW_WORDS: Readonly<Record<SignalWindowMode, string>> = {
  avg: 'on average',
  min: 'at its lowest',
  max: 'at its highest',
  rate: 'per minute',
  count: 'times',
};

const FIRST_WORDS: Readonly<Record<SignalFirstPeriod, string>> = {
  day: 'for the first time today',
  week: 'for the first time this week',
  ever: 'for the first time ever',
};

const DURATION_UNITS = [
  { seconds: 86_400, one: 'day', many: 'days' },
  { seconds: 3600, one: 'hour', many: 'hours' },
  { seconds: 60, one: 'minute', many: 'minutes' },
  { seconds: 1, one: 'second', many: 'seconds' },
] as const;

export function durationWords(totalSeconds: number): string {
  let left = Math.max(0, Math.round(totalSeconds));
  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    const amount = Math.floor(left / unit.seconds);
    if (amount > 0) {
      parts.push(`${String(amount)} ${amount === 1 ? unit.one : unit.many}`);
      left -= amount * unit.seconds;
    }
  }
  return parts.length === 0 ? '0 seconds' : parts.join(' ');
}

export function windowWord(mode: SignalWindowMode): string {
  return WINDOW_WORDS[mode];
}

function rearmBaseOf(trigger: SignalMatcher): RearmBase | null {
  const directional = directionalTest(trigger.test);
  if (directional === null || trigger.window?.of === 'count') return null;
  const rising = directional.is === 'gt' || directional.is === 'gte';
  return { side: rising ? 'below' : 'above', threshold: directional.to };
}

function optionTimingOf(
  trigger: SignalMatcher,
): Pick<SignalTiming, 'silentSeconds' | 'first' | 'rearm' | 'rearmBase'> {
  return {
    silentSeconds: trigger.silentSeconds ?? 0,
    first: trigger.first ?? null,
    rearm: trigger.rearm ?? null,
    rearmBase: rearmBaseOf(trigger),
  };
}

export function signalTimingOf(trigger: SignalMatcher): SignalTiming {
  const test = trigger.test;
  return {
    window: trigger.window ?? null,
    atLeast:
      trigger.window?.of === 'count' && test?.is === 'gte' ? test.to : DEFAULT_COUNT_AT_LEAST,
    debounceSeconds: trigger.debounceSeconds ?? 0,
    holdSeconds: trigger.holdSeconds ?? 0,
    cooldownSeconds: trigger.cooldownSeconds ?? 0,
    ...optionTimingOf(trigger),
  };
}

export function countWords(timing: SignalTiming): string | null {
  return timing.window?.of === 'count'
    ? `${String(timing.atLeast)} times in ${durationWords(timing.window.seconds)}`
    : null;
}

export function holdWords(timing: SignalTiming, stays: string | null): string | null {
  return timing.holdSeconds > 0
    ? `stays ${stays ?? 'that way'} for ${durationWords(timing.holdSeconds)}`
    : null;
}

export function timingTail(timing: SignalTiming): string {
  const { rearm, rearmBase } = timing;
  const parts = [
    ...(timing.debounceSeconds > 0
      ? [`once it settles for ${durationWords(timing.debounceSeconds)}`]
      : []),
    ...(timing.cooldownSeconds > 0
      ? [`at most every ${durationWords(timing.cooldownSeconds)}`]
      : []),
    ...(timing.first === null ? [] : [FIRST_WORDS[timing.first]]),
    ...(rearm === null || rearmBase === null
      ? []
      : [`again once ${rearmBase.side} ${String(rearm)}`]),
  ];
  return parts.join(', ');
}

export function timingRest(timing: SignalTiming): string {
  const windowed =
    timing.window === null || timing.window.of === 'count'
      ? []
      : [`${windowWord(timing.window.of)} over ${durationWords(timing.window.seconds)}`];
  const parts = [
    ...windowed,
    ...(timing.silentSeconds > 0 ? [`nothing for ${durationWords(timing.silentSeconds)}`] : []),
    timingTail(timing),
  ].filter((part) => part !== '');
  return parts.join(', ');
}

export function appendTiming(core: string, timing: SignalTiming, stays: string | null): string {
  const hold = holdWords(timing, stays);
  const rest = timingRest(timing);
  return `${core}${hold === null ? '' : ` and ${hold}`}${rest === '' ? '' : `, ${rest}`}`;
}

export function timingSummary(timing: SignalTiming): string {
  const counted = countWords(timing);
  return [counted ?? '', holdWords(timing, null) ?? '', timingRest(timing)]
    .filter((part) => part !== '')
    .join(', ');
}
