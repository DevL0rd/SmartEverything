import type { VisualState } from '../types';
import { activeOf, batteryEntry, fraction, share, type SignalEntry } from './signals-of-units';

type PhoneFacts = NonNullable<VisualState['phone']>;

function sourceOf(state: VisualState): string | undefined {
  return state.source === null || state.source === '' ? undefined : state.source;
}

export function televisionEntries(state: VisualState): readonly SignalEntry[] {
  return [
    ['screenOn', activeOf(state)],
    ['playing', activeOf(state)],
    ['mode', sourceOf(state)],
  ];
}

export function speakerEntries(state: VisualState): readonly SignalEntry[] {
  return [
    ['volume', fraction(state.level)],
    ['playing', activeOf(state)],
  ];
}

export function scaleEntries(state: VisualState): readonly SignalEntry[] {
  return [['phase', state.reading === null ? 'idle' : 'reading'], batteryEntry(state)];
}

export function wearableEntries(state: VisualState): readonly SignalEntry[] {
  return [
    ['progress', fraction(state.progress)],
    ['phase', state.syncing ? 'syncing' : 'idle'],
    batteryEntry(state),
  ];
}

function foldOf(facts: PhoneFacts): number | undefined {
  return facts.fold === null ? undefined : facts.fold === 'open' ? 1 : 0;
}

function phoneFacts(facts: PhoneFacts): readonly SignalEntry[] {
  return [
    ['battery', share(facts.level)],
    ['charging', facts.charging],
    ['ringing', facts.ringing],
    ['screenOn', facts.screenOn],
    ['playing', facts.playing],
    ['lamp', facts.torch],
    ['fold', foldOf(facts)],
    ['mode', facts.ringer ?? undefined],
  ];
}

export function phoneEntries(state: VisualState): readonly SignalEntry[] {
  return state.phone === undefined ? [] : phoneFacts(state.phone);
}
