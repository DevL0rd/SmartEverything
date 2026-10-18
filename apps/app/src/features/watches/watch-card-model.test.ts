import { describe, expect, it } from 'vitest';
import { clock } from '../../format/time';
import {
  findControlOf,
  findRequestOf,
  goalRingsOf,
  headlineOf,
  heartCaption,
  lowBattery,
  stateLineOf,
  syncControlOf,
  type WatchFacts,
} from './watch-card-model';

const FACTS: WatchFacts = {
  battery: 55,
  charging: false,
  worn: true,
  phase: 'connected',
  syncing: false,
  syncedAt: '2026-10-16T14:11:00Z',
  onThisPhone: true,
};

describe('the headline chip of a watch', () => {
  it('says on wrist while worn', () => {
    expect(headlineOf(FACTS, null)).toEqual({ tone: 'positive', label: 'On wrist' });
  });

  it('says off wrist in a neutral tone', () => {
    expect(headlineOf({ ...FACTS, worn: false }, null)).toEqual({
      tone: 'neutral',
      label: 'Off wrist',
    });
  });

  it('says charging before anything else but a stale relay', () => {
    expect(headlineOf({ ...FACTS, charging: true, battery: 10 }, null).label).toBe('Charging');
  });

  it('warns at 20 percent or less when not charging', () => {
    expect(headlineOf({ ...FACTS, battery: 20 }, null)).toEqual({
      tone: 'warning',
      label: 'Low battery',
    });
    expect(headlineOf({ ...FACTS, battery: 21 }, null).label).toBe('On wrist');
  });

  it('gives the time it was last seen when the relay is stale', () => {
    const seen = Date.parse('2026-10-16T13:20:00Z');
    expect(headlineOf(FACTS, seen)).toEqual({
      tone: 'neutral',
      label: `Last seen ${clock(seen)}`,
    });
  });

  it('does not claim a wrist state it does not know', () => {
    expect(headlineOf({ ...FACTS, worn: null }, null).label).toBe('Not reporting');
  });
});

describe('the state line of a watch', () => {
  const input = { facts: FACTS, lastSeen: null, owner: null, ringing: false };

  it('gives battery and sync time', () => {
    expect(stateLineOf(input)).toBe(`Battery 55 % · Synced ${clock(FACTS.syncedAt ?? '')}`);
  });

  it('says syncing while it syncs', () => {
    expect(stateLineOf({ ...input, facts: { ...FACTS, syncing: true } })).toContain('Syncing…');
  });

  it('tells to charge soon when low', () => {
    expect(stateLineOf({ ...input, facts: { ...FACTS, battery: 15 } })).toContain('Charge soon');
  });

  it('names the phone that relays a stale watch', () => {
    expect(stateLineOf({ ...input, lastSeen: 1, owner: 'Dana' })).toBe('via Dana’s phone');
    expect(stateLineOf({ ...input, lastSeen: 1 })).toBe('via its phone');
  });

  it('asks to stop the ring while it rings', () => {
    expect(stateLineOf({ ...input, ringing: true })).toBe('Ringing… tap Stop ringing');
  });

  it('knows low battery only when not charging', () => {
    expect(lowBattery({ battery: 15, charging: false })).toBe(true);
    expect(lowBattery({ battery: 15, charging: true })).toBe(false);
    expect(lowBattery({ battery: null, charging: false })).toBe(false);
  });
});

describe('the sync control', () => {
  it('is ready when the watch is connected to this phone', () => {
    expect(syncControlOf(FACTS, null)).toEqual({
      label: 'Sync',
      loading: false,
      disabled: false,
      reason: null,
    });
  });

  it('is disabled with the owner’s name when the watch belongs to another phone', () => {
    const control = syncControlOf({ ...FACTS, onThisPhone: false }, 'Dana');
    expect(control).toMatchObject({ label: 'Sync from Dana’s phone', disabled: true });
    expect(control.reason).not.toBeNull();
  });

  it('shows progress while syncing', () => {
    expect(syncControlOf({ ...FACTS, syncing: true }, null)).toMatchObject({
      label: 'Syncing…',
      loading: true,
      disabled: true,
    });
  });

  it('is disabled with a reason when the watch is not connected', () => {
    const control = syncControlOf({ ...FACTS, phase: 'waiting' }, null);
    expect(control.disabled).toBe(true);
    expect(control.reason).not.toBeNull();
  });
});

describe('the find control', () => {
  it('offers to find, then to stop', () => {
    expect(findControlOf(false, false, null)).toMatchObject({ label: 'Find watch', filled: false });
    expect(findControlOf(true, false, null)).toMatchObject({ label: 'Stop ringing', filled: true });
  });

  it('shows progress while the request is out', () => {
    expect(findControlOf(false, true, null).loading).toBe(true);
  });

  it('cannot start on a stale relay but can always stop', () => {
    expect(findControlOf(false, false, 1).disabled).toBe(true);
    expect(findControlOf(true, false, 1).disabled).toBe(false);
  });
});

describe('the heart caption', () => {
  it('says now for a live reading and the time for an old one', () => {
    const at = Date.parse('2026-10-16T14:02:00Z');
    expect(heartCaption({ bpm: 80, at, fresh: true })).toBe('Heart now');
    expect(heartCaption({ bpm: 80, at, fresh: false })).toBe(`Heart ${clock(at)}`);
    expect(heartCaption(null)).toBeNull();
  });
});

describe('the goal rings', () => {
  const base = {
    steps: 4210,
    stepsGoal: 6000,
    energy: 520,
    energyGoal: 800,
    minutes: 38,
    minutesGoal: 60,
  };

  it('draws one ring per goal the watch has data for', () => {
    expect(goalRingsOf(base).map((ring) => ring.key)).toEqual(['steps', 'move', 'active']);
    expect(goalRingsOf({ ...base, energy: null, minutes: null }).map((ring) => ring.key)).toEqual([
      'steps',
    ]);
  });

  it('starts steps at zero when none were counted', () => {
    expect(goalRingsOf({ ...base, steps: null })[0]?.value).toBe(0);
  });
});

describe('the find request', () => {
  it('asks the watch to ring first and to stop once it rings', () => {
    expect(findRequestOf(false)).toEqual({ type: 'find_watch', on: true });
    expect(findRequestOf(true)).toEqual({ type: 'find_watch', on: false });
  });
});
