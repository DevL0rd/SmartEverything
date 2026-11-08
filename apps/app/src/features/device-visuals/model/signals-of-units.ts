import type { ModelSignalName, ModelSignalValue } from '@smarteverything/domain';
import type { VisualState } from '../types';

export type SignalEntry = readonly [ModelSignalName, ModelSignalValue | undefined];

export type EntriesOf = (state: VisualState) => readonly SignalEntry[];

const PERCENT = 100;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function fraction(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : clamp01(value);
}

export function share(percent: number | null | undefined): number | undefined {
  return percent === null || percent === undefined ? undefined : clamp01(percent / PERCENT);
}

export function openness(open: boolean | null): number | undefined {
  return open === null ? undefined : open ? 1 : 0;
}

export function batteryEntry(state: VisualState): SignalEntry {
  return ['battery', share(state.battery)];
}

export function presenceEntry(state: VisualState): SignalEntry {
  return ['presence', state.presence ?? undefined];
}

export function activeOf(state: VisualState): boolean | undefined {
  return state.power === 'unknown' ? undefined : state.power === 'on' && state.online;
}
