import { describe, expect, it } from 'vitest';
import type { SignalInput } from '@smarteverything/domain';
import { SignalWatchers } from '../../../src/signals/signal-watchers';
import {
  compileTriggers,
  signalFire,
  watchedOf,
} from '../../../src/automations/triggers-v3/armers';
import { FakeClock } from '../../support/fake-clock';
import { MemoryWatchState } from '../../support/watch-state';
import { node, signal } from './support';

const START = '2026-10-19T08:00:00.000Z';

function rig(): {
  clock: FakeClock;
  state: MemoryWatchState;
  fired: { triggerId: string; signal: SignalInput }[];
  watchers: SignalWatchers;
} {
  const clock = new FakeClock(START);
  const state = new MemoryWatchState();
  const fired: { triggerId: string; signal: SignalInput }[] = [];
  const watchers = new SignalWatchers({
    clock,
    timeZone: (): string => 'UTC',
    state,
    fire: (_automationId, observed, triggerId): void => {
      fired.push({ triggerId, signal: observed });
    },
  });
  return { clock, state, fired, watchers };
}

describe('watch memory of v3 triggers', () => {
  it('keeps the memory of each trigger under its own id and fires with that id', () => {
    const quiet = node('trigger.device', { device: 'lamp', control: 'power', silentFor: 60_000 });
    const plain = node('trigger.device', { device: 'lamp', control: 'power' });
    const compiled = compileTriggers('auto', [quiet, plain]);
    const { clock, state, fired, watchers } = rig();
    watchers.load([watchedOf(compiled, () => false)]);
    clock.advanceTo('2026-10-19T08:00:10.000Z');
    watchers.observe(signal({ at: '2026-10-19T08:00:10.000Z' }));
    expect(fired.map((entry) => entry.triggerId)).toEqual([plain.id]);
    expect([...state.rows.keys()]).toEqual([`auto|${quiet.id}|`]);
    clock.advanceTo('2026-10-19T08:01:20.000Z');
    expect(fired.map((entry) => entry.triggerId)).toEqual([plain.id, quiet.id]);
    const last = fired.at(-1);
    expect(
      last === undefined ? null : signalFire(compiled, last.signal, last.triggerId),
    ).toMatchObject({
      triggerId: quiet.id,
      key: quiet.key,
    });
  });

  it('drops the memory of a trigger that is no longer in the program', () => {
    const quiet = node('trigger.device', { device: 'lamp', control: 'power', silentFor: 60_000 });
    const { clock, state, watchers } = rig();
    watchers.load([watchedOf(compileTriggers('auto', [quiet]), () => false)]);
    clock.advanceTo('2026-10-19T08:00:10.000Z');
    watchers.observe(signal({ at: '2026-10-19T08:00:10.000Z' }));
    expect(state.rows.size).toBe(1);
    watchers.load([watchedOf(compileTriggers('auto', []), () => false)]);
    expect(state.rows.size).toBe(0);
  });
});
