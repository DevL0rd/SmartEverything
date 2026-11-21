import {
  CLIENT_PREFS,
  PLANNER_SIGNAL,
  type PlannerBedtime,
  type PlannerPreferences,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clockTextIn } from '../../src/clock/person-clock';
import { SimulatedClock } from '../../src/clock/simulated';
import { BedtimeDesk, type BedtimeDelivery } from '../../src/planner/bedtime/desk';
import { momentsOf, upcomingWindows, windowOn } from '../../src/planner/bedtime/schedule';
import { DEFAULT_PREFERENCES, loadPlannerPreferences } from '../../src/planner/preferences';
import { SleepSoundControl } from '../../src/planner/sleep-sound';
import type { OwnerAlert } from '../../src/extensions/owner-alerts';
import { advanceSettled } from '../support/host-settle';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

const NOISE = { kind: 'noise', colour: 'brown' } as const;

function bedtime(change: Partial<PlannerBedtime> = {}): PlannerBedtime {
  return {
    enabled: true,
    schedule: [{ days: EVERY_DAY, bed: '22:30', wake: '06:30' }],
    reminder_minutes: 30,
    wind_down_minutes: 45,
    wind_down_automation_id: null,
    do_not_disturb: true,
    sleep_sound: null,
    ...change,
  };
}

describe('bedtime schedule', () => {
  it('builds an overnight window with the wake time on the next day', () => {
    const window = windowOn(bedtime(), Temporal.PlainDate.from('2026-11-09'), 'UTC');
    expect(window).toEqual({
      windDownAt: '2026-11-09T21:45:00Z',
      bedAt: '2026-11-09T22:30:00Z',
      wakeAt: '2026-11-10T06:30:00Z',
    });
  });

  it('keeps the wake time on the same day when it is later than bed', () => {
    const window = windowOn(
      bedtime({ schedule: [{ days: EVERY_DAY, bed: '01:00', wake: '09:00' }] }),
      Temporal.PlainDate.from('2026-11-09'),
      'UTC',
    );
    expect(window?.bedAt).toBe('2026-11-09T01:00:00Z');
    expect(window?.wakeAt).toBe('2026-11-09T09:00:00Z');
  });

  it('starts wind-down at bed time when no wind-down is set', () => {
    const window = windowOn(
      bedtime({ wind_down_minutes: null }),
      Temporal.PlainDate.from('2026-11-09'),
      'UTC',
    );
    expect(window?.windDownAt).toBe(window?.bedAt);
  });

  it('follows the weekday of the evening the night starts on', () => {
    const weekdays = bedtime({ schedule: [{ days: [1], bed: '22:00', wake: '06:00' }] });
    expect(windowOn(weekdays, Temporal.PlainDate.from('2026-11-09'), 'UTC')).not.toBeNull();
    expect(windowOn(weekdays, Temporal.PlainDate.from('2026-11-10'), 'UTC')).toBeNull();
  });

  it('includes the night in progress and the nights after it', () => {
    const windows = upcomingWindows(bedtime(), new Date('2026-11-10T02:00:00Z'), 'UTC', 2);
    expect(windows.map((window) => window.bedAt)).toEqual([
      '2026-11-09T22:30:00Z',
      '2026-11-10T22:30:00Z',
    ]);
  });

  it('gives no windows when bedtime is off or has no schedule', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(upcomingWindows(bedtime({ enabled: false }), now, 'UTC', 2)).toEqual([]);
    expect(upcomingWindows(bedtime({ schedule: [] }), now, 'UTC', 2)).toEqual([]);
  });

  it('keeps the local bed time across a daylight saving change', () => {
    const zone = 'America/New_York';
    const before = windowOn(bedtime(), Temporal.PlainDate.from('2026-10-31'), zone);
    const after = windowOn(bedtime(), Temporal.PlainDate.from('2026-11-01'), zone);
    expect(before?.bedAt).toBe('2026-11-01T02:30:00Z');
    expect(after?.bedAt).toBe('2026-11-02T03:30:00Z');
  });

  it('lists reminder, wind-down, bed and wake moments that are still ahead', () => {
    const settings = bedtime();
    const now = new Date('2026-11-09T22:00:00Z');
    const moments = momentsOf(settings, upcomingWindows(settings, now, 'UTC', 1), now);
    expect(moments.map((moment) => [moment.kind, moment.at.toISOString()])).toEqual([
      ['bed', '2026-11-09T22:30:00.000Z'],
      ['wake', '2026-11-10T06:30:00.000Z'],
    ]);
  });
});

let test: TestStore;
let clock: SimulatedClock;
let person: TestPerson;
let desk: BedtimeDesk;
let delivered: { clientId: string; notice: BedtimeDelivery }[];
let pushes: OwnerAlert[];
let signals: SignalInput[];
let scenes: string[];
let reachable: boolean;
let sleepSound: SleepSoundControl;

function setClockFormat(hour24: boolean): void {
  test.store.personal.saveLayout(
    { clientId: person.client.id, profileId: person.profileId },
    CLIENT_PREFS.clock_format.storageKey,
    CLIENT_PREFS.clock_format.encode({ hour24 }),
  );
}

function setBedtime(change: Partial<PlannerBedtime>): void {
  const current =
    test.store.plannerPreferences.find(person.profileId)?.preferences ?? DEFAULT_PREFERENCES;
  test.store.plannerPreferences.put(person.profileId, { ...current, bedtime: bedtime(change) });
}

beforeEach(async () => {
  test = await testStore();
  clock = new SimulatedClock('2026-11-09T20:00:00.000Z');
  person = addPerson(test, 'Ann', 'owner');
  delivered = [];
  pushes = [];
  signals = [];
  scenes = [];
  reachable = true;
  const preferencesOf = (profileId: string): Promise<PlannerPreferences> =>
    loadPlannerPreferences(test.store, profileId);
  const deliver = (clientId: string, notice: BedtimeDelivery): Promise<boolean> => {
    delivered.push({ clientId, notice });
    return Promise.resolve(reachable);
  };
  sleepSound = new SleepSoundControl({
    store: test.store,
    deliver,
    preferencesOf,
    log: testLogger('sleep-sound'),
  });
  desk = new BedtimeDesk({
    store: test.store,
    clock,
    emit: (signal): void => {
      signals.push(signal);
    },
    channel: {
      deliver,
      push: (alert): void => {
        pushes.push(alert);
      },
    },
    runAutomation: (automationId): Promise<void> => {
      scenes.push(automationId);
      return Promise.resolve();
    },
    sleepSound,
    preferencesOf,
    log: testLogger('bedtime'),
  });
});

afterEach(async () => {
  desk.stop();
  await test.close();
});

async function advance(iso: string): Promise<void> {
  await advanceSettled(clock, iso, () => desk.settled());
}

function kinds(): string[] {
  return signals.map((signal) => PLANNER_SIGNAL.parse(signal).kind);
}

describe('bedtime desk', () => {
  it('arms nothing while bedtime is off', async () => {
    setBedtime({ enabled: false });
    await desk.start();
    expect(clock.pending()).toEqual([]);
  });

  it('writes the reminder time on the person’s 12-hour clock', async () => {
    setBedtime({});
    setClockFormat(false);
    await desk.start();
    await advance('2026-11-09T22:00:00.000Z');
    expect(pushes.map((push) => push.body)).toEqual([
      `Time to get ready for bed at ${clockTextIn('2026-11-09T22:30:00Z', test.store.settings.read().time_zone, false)}.`,
    ]);
    expect(pushes[0]?.body).toMatch(/ PM\.$/u);
  });

  it('sends the reminder to the phones, pushes it and raises the signal', async () => {
    setBedtime({});
    setClockFormat(true);
    await desk.start();
    await advance('2026-11-09T22:00:00.000Z');
    expect(delivered.filter((entry) => entry.notice.type === 'planner_bedtime')).toEqual([
      {
        clientId: person.client.id,
        notice: { type: 'planner_bedtime', bedAt: '2026-11-09T22:30:00Z', minutesBefore: 30 },
      },
    ]);
    expect(pushes).toEqual([
      {
        title: 'Bedtime is coming up',
        body: 'Time to get ready for bed at 22:30.',
        data: { kind: 'planner_bedtime', bedAt: '2026-11-09T22:30:00Z' },
        person: person.profileId,
      },
    ]);
    const signal = PLANNER_SIGNAL.parse(signals.at(-1));
    expect(signal.kind).toBe('bedtime_reminder');
    expect(signal.profileId).toBe(person.profileId);
    expect(signal.data).toEqual({ bedAt: '2026-11-09T22:30:00Z', minutesBefore: 30 });
  });

  it('starts wind-down by running the scene, telling the phones and raising the signal', async () => {
    const automationId = '3b5c0b6c-7f0c-4a54-9a49-0b8d9e5f4a10';
    setBedtime({ wind_down_automation_id: automationId });
    await desk.start();
    await advance('2026-11-09T21:45:00.000Z');
    expect(scenes).toEqual([automationId]);
    expect(delivered.map((entry) => entry.notice)).toContainEqual({
      type: 'planner_wind_down',
      bedAt: '2026-11-09T22:30:00Z',
      wakeAt: '2026-11-10T06:30:00Z',
      minutes: 45,
    });
    expect(kinds()).toEqual(['wind_down_started']);
  });

  it('skips the scene when none is chosen and the wind-down when it is off', async () => {
    setBedtime({ wind_down_minutes: null });
    await desk.start();
    await advance('2026-11-09T22:30:00.000Z');
    expect(scenes).toEqual([]);
    expect(kinds()).toEqual(['bedtime_reminder']);
  });

  it('plays the bedtime sleep sound at bed time and stops it at the wake time', async () => {
    setBedtime({ sleep_sound: NOISE });
    await desk.start();
    await advance('2026-11-09T22:30:00.000Z');
    const played = delivered
      .map((entry) => entry.notice)
      .filter((n) => n.type === 'planner_sleep_sound');
    expect(played).toEqual([
      {
        type: 'planner_sleep_sound',
        action: 'play',
        sound: NOISE,
        timerMinutes: 60,
        fadeSeconds: 30,
      },
    ]);
    await advance('2026-11-10T06:30:00.000Z');
    const stops = delivered
      .map((entry) => entry.notice)
      .filter((n) => n.type === 'planner_sleep_sound' && n.action === 'stop');
    expect(stops).toHaveLength(1);
    expect(kinds()).toContain('wake_time');
  });

  it('raises the wake signal and arms the next night after the wake time', async () => {
    setBedtime({});
    await desk.start();
    await advance('2026-11-10T06:30:00.000Z');
    expect(kinds()).toEqual(['wind_down_started', 'bedtime_reminder', 'wake_time']);
    expect(clock.pending()[0]).toBe('2026-11-10T21:45:00.000Z');
  });

  it('rearms at once when the schedule changes and cancels what no longer applies', async () => {
    setBedtime({});
    await desk.start();
    setBedtime({ schedule: [{ days: EVERY_DAY, bed: '23:30', wake: '07:30' }] });
    await desk.refresh(person.profileId);
    await advance('2026-11-09T22:30:00.000Z');
    expect(signals).toEqual([]);
    await advance('2026-11-09T23:00:00.000Z');
    expect(kinds()).toEqual(['wind_down_started', 'bedtime_reminder']);
  });

  it('cancels every armed moment when bedtime is switched off', async () => {
    setBedtime({});
    await desk.start();
    setBedtime({ enabled: false });
    await desk.refresh(person.profileId);
    await advance('2026-11-10T08:00:00.000Z');
    expect(signals).toEqual([]);
  });

  it('does not fire moments that already passed when it starts', async () => {
    setBedtime({});
    clock.jumpTo('2026-11-09T22:20:00.000Z');
    await desk.start();
    await advance('2026-11-10T06:30:00.000Z');
    expect(kinds()).toEqual(['wake_time']);
  });
});

describe('sleep sound control', () => {
  it('plays the saved sound with the saved timer and fade', async () => {
    const current =
      test.store.plannerPreferences.find(person.profileId)?.preferences ?? DEFAULT_PREFERENCES;
    test.store.plannerPreferences.put(person.profileId, {
      ...current,
      sleep_sounds: { sound: NOISE, timer_minutes: 20, fade_seconds: 10 },
    });
    expect(await sleepSound.play(person.profileId)).toBe(1);
    expect(delivered[0]?.notice).toEqual({
      type: 'planner_sleep_sound',
      action: 'play',
      sound: NOISE,
      timerMinutes: 20,
      fadeSeconds: 10,
    });
  });

  it('lets the request choose the sound, no timer and its own fade', async () => {
    await sleepSound.play(person.profileId, {
      sound: { kind: 'noise', colour: 'white' },
      timerMinutes: null,
      fadeSeconds: 0,
    });
    expect(delivered[0]?.notice).toEqual({
      type: 'planner_sleep_sound',
      action: 'play',
      sound: { kind: 'noise', colour: 'white' },
      timerMinutes: null,
      fadeSeconds: 0,
    });
  });

  it('refuses to play when no sound is chosen anywhere', async () => {
    await expect(sleepSound.play(person.profileId)).rejects.toThrow('Choose a sleep sound first.');
  });

  it('stops playback on the phones of the person', async () => {
    expect(await sleepSound.stop(person.profileId)).toBe(1);
    expect(delivered[0]).toEqual({
      clientId: person.client.id,
      notice: {
        type: 'planner_sleep_sound',
        action: 'stop',
        sound: null,
        timerMinutes: null,
        fadeSeconds: 0,
      },
    });
  });

  it('counts only the phones that were reached', async () => {
    reachable = false;
    expect(await sleepSound.stop(person.profileId)).toBe(0);
  });

  it('refuses a phone that belongs to someone else', async () => {
    const other = addPerson(test, 'Bob', 'member');
    await expect(sleepSound.stop(person.profileId, other.client.id)).rejects.toThrow(
      'That phone does not belong to this person.',
    );
  });

  it('reaches only the chosen phone of the person', async () => {
    await sleepSound.stop(person.profileId, person.client.id);
    expect(delivered.map((entry) => entry.clientId)).toEqual([person.client.id]);
  });
});
