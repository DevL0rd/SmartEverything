import type { VisualState } from '../types';
import { batteryEntry, openness, presenceEntry, type SignalEntry } from './signals-of-units';

type ButtonFacts = NonNullable<VisualState['button']>;

export function socketEntries(state: VisualState): readonly SignalEntry[] {
  return [['level', state.load ?? undefined]];
}

export function sensorEntries(state: VisualState): readonly SignalEntry[] {
  return [
    presenceEntry(state),
    ['open', openness(state.open)],
    ['objects', state.detection?.objects ?? undefined],
    batteryEntry(state),
  ];
}

export function cameraEntries(state: VisualState): readonly SignalEntry[] {
  return [
    ['motion', state.presence ?? undefined],
    ['cameraPan', null],
    ['cameraTilt', null],
    batteryEntry(state),
  ];
}

export function doorbellEntries(state: VisualState): readonly SignalEntry[] {
  return [['motion', state.presence ?? undefined], batteryEntry(state)];
}

function gestureOf(facts: ButtonFacts | undefined): string {
  return facts?.lastPress?.gesture ?? 'none';
}

export function buttonEntries(state: VisualState): readonly SignalEntry[] {
  return [['pressed', gestureOf(state.button)], batteryEntry(state)];
}

export function lockEntries(state: VisualState): readonly SignalEntry[] {
  return [['locked', state.locked ?? undefined], batteryEntry(state)];
}

export function coverEntries(state: VisualState): readonly SignalEntry[] {
  return [['position', state.position ?? undefined], batteryEntry(state)];
}
