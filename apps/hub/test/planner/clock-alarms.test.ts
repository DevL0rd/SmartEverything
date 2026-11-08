import {
  PLANNER_RING_NOTICE,
  type PlannerAlarmRow,
  type PlannerRingNotice,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerAlarmInput } from '../../src/store/repositories/planner-alarms';
import { SimulatedClock } from '../../src/clock/simulated';
import { AlarmScheduler, nextRing, ringsBetween } from '../../src/planner/alarms';
import { RingDesk } from '../../src/planner/rings';
import { WakeRoutine } from '../../src/planner/wake-routine';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';
const ZONE = 'Europe/Berlin';
const WEEKDAYS = [1, 2, 3, 4, 5];
const SCENE = '5b1c1c0e-7d1c-4a55-9f7a-3a3f0f6f2c11';

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let other: TestPerson;
let signals: SignalInput[];
let notices: PlannerRingNotice[];
let scenes: ReturnType<typeof vi.fn<(sceneId: string, profileId: string) => Promise<void>>>;
let scheduler: AlarmScheduler;

function build(): AlarmScheduler {
  const rings = new RingDesk({
    store: test.store,
    clock,
    emit: (signal): void => {
      signals.push(signal);
    },
    log: testLogger(),
  });
  const wake = new WakeRoutine({ clock, runScene: scenes, log: testLogger() });
  return new AlarmScheduler({ store: test.store, clock, rings, wake, log: testLogger() });
}

function alarm(change: Partial<PlannerAlarmInput> = {}): PlannerAlarmRow {
  return test.store.plannerAlarms.insert({ ...base(), ...change });
}

function base(): PlannerAlarmInput {
  return {
    profile_id: owner.profileId,
    label: 'Work',
    time: '07:00',
    days: WEEKDAYS,
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'sunrise',
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
  };
}

function rings(alarmId: string): ReturnType<typeof test.store.plannerRings.forRef> {
  return test.store.plannerRings.forRef('alarm', alarmId);
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: ZONE });
  owner = addPerson(test, 'Owner', 'owner');
  other = addPerson(test, 'Other', 'member');
  signals = [];
  notices = [];
  scenes = vi.fn<(sceneId: string, profileId: string) => Promise<void>>(() => Promise.resolve());
  test.store.feed.subscribeNotices((notice) => {
    if (notice.type === 'planner_ring') notices.push(PLANNER_RING_NOTICE.parse(notice));
  });
  scheduler = build();
});

afterEach(async () => {
  scheduler.stop();
  await test.close();
});

describe('next ring', () => {
  it('finds the next weekday across the weekend in the home zone', () => {
    const next = nextRing(base(), new Date(START), ZONE);
    expect(next?.toISOString()).toBe('2026-11-09T06:00:00.000Z');
  });

  it('skips the skipped date and rings the day after', () => {
    const next = nextRing({ ...base(), skip_on: '2026-11-09' }, new Date(START), ZONE);
    expect(next?.toISOString()).toBe('2026-11-10T06:00:00.000Z');
  });

  it('rings once on a date and never again', () => {
    const once = { ...base(), days: [], once_on: '2026-11-12' };
    expect(nextRing(once, new Date(START), ZONE)?.toISOString()).toBe('2026-11-12T06:00:00.000Z');
    expect(nextRing(once, new Date('2026-11-12T06:00:00.000Z'), ZONE)).toBeNull();
    expect(nextRing({ ...once, skip_on: '2026-11-12' }, new Date(START), ZONE)).toBeNull();
  });

  it('keeps the wall time across the clock change and moves through a gap', () => {
    const daily = { ...base(), days: [0, 1, 2, 3, 4, 5, 6], time: '02:30' };
    const before = nextRing(daily, new Date('2026-03-28T12:00:00.000Z'), ZONE);
    const after = nextRing(daily, new Date('2026-03-29T12:00:00.000Z'), ZONE);
    expect(before?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(after?.toISOString()).toBe('2026-03-30T00:30:00.000Z');
  });

  it('lists every ring in a window', () => {
    const found = ringsBetween(base(), new Date(START), new Date('2026-11-11T08:00:00.000Z'), ZONE);
    expect(found.map((moment) => moment.toISOString())).toEqual([
      '2026-11-09T06:00:00.000Z',
      '2026-11-10T06:00:00.000Z',
      '2026-11-11T06:00:00.000Z',
    ]);
  });
});

describe('ringing', () => {
  it('rings at the instant with a ring row, a notice and a signal, then arms the next day', () => {
    const saved = alarm();
    scheduler.start();
    clock.advanceTo('2026-11-09T06:00:00.000Z');
    const [ring] = rings(saved.id);
    expect(ring).toMatchObject({ outcome: 'rang', due_at: '2026-11-09T06:00:00.000Z' });
    expect(notices).toEqual([
      {
        type: 'planner_ring',
        ringId: ring?.id,
        kind: 'alarm',
        refId: saved.id,
        dueAt: ring?.due_at,
      },
    ]);
    expect(signals.map((signal) => signal.kind)).toEqual(['alarm_rang']);
    expect(clock.pending()).toEqual(['2026-11-10T06:00:00.000Z']);
  });

  it('disables a once-only alarm after it rings', () => {
    const saved = alarm({ days: [], once_on: '2026-11-08' });
    scheduler.start();
    clock.advanceTo('2026-11-08T06:00:00.000Z');
    expect(rings(saved.id)).toHaveLength(1);
    expect(test.store.plannerAlarms.byId(saved.id, owner.profileId).enabled).toBe(false);
    expect(clock.pending()).toEqual([]);
  });

  it('skip next moves the ring to the following day', () => {
    const saved = alarm();
    scheduler.start();
    const skipped = scheduler.skipNext(owner.profileId, saved.id);
    expect(skipped.skip_on).toBe('2026-11-09');
    expect(clock.pending()).toEqual(['2026-11-10T06:00:00.000Z']);
    clock.advanceTo('2026-11-09T12:00:00.000Z');
    expect(rings(saved.id)).toHaveLength(0);
    clock.advanceTo('2026-11-10T06:00:00.000Z');
    expect(rings(saved.id)).toHaveLength(1);
  });

  it('refuses to skip the next ring of an alarm that does not repeat', () => {
    const saved = alarm({ days: [], once_on: '2026-11-12' });
    expect(() => scheduler.skipNext(owner.profileId, saved.id)).toThrow(/repeating/);
  });

  it('re-arms when the alarm time is edited', () => {
    const saved = alarm();
    scheduler.start();
    test.store.plannerAlarms.update(saved.id, owner.profileId, { time: '06:00' });
    expect(clock.pending()).toEqual(['2026-11-09T05:00:00.000Z']);
    test.store.plannerAlarms.update(saved.id, owner.profileId, { enabled: false });
    expect(clock.pending()).toEqual([]);
  });
});

describe('snooze and dismiss', () => {
  function ringOnce(): { alarmId: string; ringId: string } {
    const saved = alarm();
    scheduler.start();
    clock.advanceTo('2026-11-09T06:00:00.000Z');
    const [ring] = rings(saved.id);
    if (ring === undefined) throw new Error('the alarm did not ring');
    return { alarmId: saved.id, ringId: ring.id };
  }

  it('rings again after the alarm snooze length', () => {
    const { ringId } = ringOnce();
    notices.length = 0;
    const snoozed = scheduler.snooze(owner.profileId, ringId);
    expect(snoozed.snoozes).toBe(1);
    expect(snoozed.rang_at).toBe('2026-11-09T06:09:00.000Z');
    expect(signals.at(-1)).toMatchObject({ kind: 'alarm_snoozed' });
    expect(test.store.plannerRings.ringing(owner.profileId)).toHaveLength(1);
    clock.advanceTo('2026-11-09T06:09:00.000Z');
    expect(signals.filter((signal) => signal.kind === 'alarm_rang')).toHaveLength(2);
    expect(notices.map((notice) => notice.ringId)).toEqual([ringId, ringId]);
  });

  it('dismiss closes the ring, tells the clients and stops a pending snooze', () => {
    const { ringId } = ringOnce();
    scheduler.snooze(owner.profileId, ringId, 5);
    notices.length = 0;
    const dismissed = scheduler.dismiss(owner.profileId, ringId);
    expect(dismissed.dismissed_at).toBe('2026-11-09T06:00:00.000Z');
    expect(notices).toHaveLength(1);
    expect(signals.at(-1)).toMatchObject({ kind: 'alarm_dismissed' });
    clock.advanceTo('2026-11-09T06:30:00.000Z');
    expect(signals.filter((signal) => signal.kind === 'alarm_rang')).toHaveLength(1);
    expect(() => scheduler.dismiss(owner.profileId, ringId)).toThrow(/no longer ringing/);
  });

  it('keeps one person from dismissing another person ring', () => {
    const { ringId } = ringOnce();
    expect(() => scheduler.dismiss(other.profileId, ringId)).toThrow(/does not exist/);
  });
});

describe('wake routine', () => {
  it('runs the scene the lead minutes before the ring', () => {
    alarm({ wake_scene_id: SCENE, wake_lead_minutes: 20 });
    scheduler.start();
    expect(clock.pending()).toEqual(['2026-11-09T05:40:00.000Z', '2026-11-09T06:00:00.000Z']);
    clock.advanceTo('2026-11-09T05:40:00.000Z');
    expect(scenes).toHaveBeenCalledExactlyOnceWith(SCENE, owner.profileId);
  });

  it('does not run the scene late when the lead moment has already passed', () => {
    const saved = alarm({ time: '09:00', days: [], once_on: '2026-11-07' });
    clock.jumpTo('2026-11-07T07:50:00.000Z');
    scheduler.start();
    test.store.plannerAlarms.update(saved.id, owner.profileId, {
      wake_scene_id: SCENE,
      wake_lead_minutes: 30,
    });
    clock.advanceTo('2026-11-07T08:00:00.000Z');
    expect(scenes).not.toHaveBeenCalled();
    expect(rings(saved.id)).toHaveLength(1);
  });
});

describe('overdue after a restart', () => {
  it('records a missed ring with its reason and never rings late', () => {
    const saved = alarm();
    clock.jumpTo('2026-11-09T09:00:00.000Z');
    scheduler.start();
    const [missed] = rings(saved.id);
    expect(missed).toMatchObject({
      outcome: 'missed',
      missed_reason: 'hub_down',
      due_at: '2026-11-09T06:00:00.000Z',
      rang_at: null,
    });
    expect(signals).toEqual([]);
    expect(clock.pending()).toEqual(['2026-11-10T06:00:00.000Z']);
  });

  it('records every ring the hub slept through, once', () => {
    const saved = alarm();
    clock.jumpTo('2026-11-11T09:00:00.000Z');
    scheduler.start();
    scheduler.stop();
    scheduler = build();
    scheduler.start();
    expect(rings(saved.id).map((ring) => ring.due_at)).toEqual([
      '2026-11-09T06:00:00.000Z',
      '2026-11-10T06:00:00.000Z',
      '2026-11-11T06:00:00.000Z',
    ]);
  });

  it('records a computer that slept through an alarm as asleep', () => {
    const saved = alarm();
    scheduler.start();
    clock.jumpTo('2026-11-09T07:00:00.000Z');
    scheduler.resumed();
    expect(rings(saved.id)).toMatchObject([
      { outcome: 'missed', missed_reason: 'computer_asleep' },
    ]);
    expect(signals).toEqual([]);
    expect(clock.pending()).toEqual(['2026-11-10T06:00:00.000Z']);
  });

  it('disables a once-only alarm that was missed', () => {
    const saved = alarm({ days: [], once_on: '2026-11-08' });
    clock.jumpTo('2026-11-08T09:00:00.000Z');
    scheduler.start();
    expect(rings(saved.id)).toMatchObject([{ outcome: 'missed' }]);
    expect(test.store.plannerAlarms.byId(saved.id, owner.profileId).enabled).toBe(false);
  });

  it('closes a snooze that came due while the hub was down and resumes a pending one', () => {
    const saved = alarm();
    scheduler.start();
    clock.advanceTo('2026-11-09T06:00:00.000Z');
    const [ring] = rings(saved.id);
    if (ring === undefined) throw new Error('the alarm did not ring');
    scheduler.snooze(owner.profileId, ring.id, 10);
    scheduler.stop();
    clock.jumpTo('2026-11-09T06:05:00.000Z');
    scheduler = build();
    scheduler.start();
    clock.advanceTo('2026-11-09T06:10:00.000Z');
    expect(signals.filter((signal) => signal.kind === 'alarm_rang')).toHaveLength(2);
    scheduler.snooze(owner.profileId, ring.id, 10);
    scheduler.stop();
    clock.jumpTo('2026-11-09T07:00:00.000Z');
    scheduler = build();
    scheduler.start();
    expect(test.store.plannerRings.byId(ring.id).dismissed_at).toBe('2026-11-09T07:00:00.000Z');
  });
});
