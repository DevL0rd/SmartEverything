import { MICROWAVE_KEYS, microwaveSecondsLeft } from '@smarteverything/domain';
import type { MicrowaveFacts, MicrowavePhase } from '../../types';
import type { ObservedValues } from '../lookup';
import type { Decorate } from './decorate';

const PERCENT = 100;

function textAt(values: ObservedValues, key: string): string | null {
  const value = values[key]?.value;
  return typeof value === 'string' ? value : null;
}

function share(values: ObservedValues): number | null {
  const value = values[MICROWAVE_KEYS.progress]?.value;
  return typeof value === 'number' ? Math.min(1, Math.max(0, value / PERCENT)) : null;
}

function phaseOf(values: ObservedValues): MicrowavePhase {
  const state = textAt(values, MICROWAVE_KEYS.state);
  return state === 'running' || state === 'paused' ? state : 'idle';
}

function levels(values: ObservedValues): readonly string[] {
  const supported = values[MICROWAVE_KEYS.supportedPower]?.value;
  return Array.isArray(supported)
    ? supported.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function powerShare(current: string | null, supported: readonly string[]): number | null {
  const index = current === null ? -1 : supported.indexOf(current);
  if (index < 0) {
    return null;
  }
  return supported.length < 2 ? 1 : index / (supported.length - 1);
}

function finishedAtOf(values: ObservedValues): string | null {
  return textAt(values, MICROWAVE_KEYS.job) === 'finished'
    ? (values[MICROWAVE_KEYS.job]?.observedAt ?? null)
    : null;
}

function microwaveFacts(values: ObservedValues): MicrowaveFacts {
  const phase = phaseOf(values);
  const lamp = textAt(values, MICROWAVE_KEYS.lamp);
  const plain = Object.fromEntries(
    Object.entries(values).map(([key, entry]) => [key, entry.value]),
  );
  return {
    phase,
    finished: textAt(values, MICROWAVE_KEYS.job) === 'finished',
    remaining: microwaveSecondsLeft(plain),
    progress: share(values),
    mode: textAt(values, MICROWAVE_KEYS.mode),
    open: textAt(values, MICROWAVE_KEYS.door) === 'open',
    lamp: lamp !== null && lamp !== 'off',
    locked: textAt(values, MICROWAVE_KEYS.lock) === 'locked',
    power: powerShare(textAt(values, MICROWAVE_KEYS.power), levels(values)),
    finishedAt: finishedAtOf(values),
  };
}

export const microwaveState: Decorate = (base, { values }) => {
  const microwave = microwaveFacts(values);
  return { ...base, power: microwave.phase === 'idle' ? 'off' : 'on', microwave };
};
