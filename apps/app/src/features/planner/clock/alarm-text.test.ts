import {
  PLANNER_ALARM_ROW,
  PLANNER_RING_ROW,
  type PlannerAlarmRow,
  type PlannerRingRow,
  type PlannerWatchLink,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { zonedInstant } from '../../../format/time';
import {
  alarmsInRingOrder,
  alarmsSubtitleOf,
  countdownOf,
  dayWordOf,
  missedAlarmsOf,
  missedPillOf,
  missedStoryOf,
  nextRingOf,
  nextRingTextOf,
  repeatTextOf,
  skipDayOf,
  soonestAlarmOf,
  wakeRoutineTimeOf,
  watchDotOf,
  watchLineOf,
} from './alarm-text';

const ZONE = 'Europe/Berlin';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const WATCH = 'a1b2c3d4-0000-4000-8000-0000000000d1';
const SCENE = 'a1b2c3d4-0000-4000-8000-0000000000e1';
const STAMP = '2026-11-01T08:00:00.000Z';
const MONDAY = 1;
const NOW = zonedInstant('2026-11-07', 14 * 60 + 20, ZONE);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function alarmOf(change: Partial<PlannerAlarmRow>): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: id(),
    profile_id: PROFILE,
    label: 'Wake up',
    time: '07:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'Morning light',
    ramp_seconds: 60,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
    created_at: STAMP,
    updated_at: STAMP,
    ...change,
  });
}

function ringOf(change: Partial<PlannerRingRow>): PlannerRingRow {
  return PLANNER_RING_ROW.parse({
    id: id(),
    kind: 'alarm',
    ref_id: id(),
    profile_id: PROFILE,
    due_at: new Date(zonedInstant('2026-11-07', 8 * 60 + 30, ZONE)).toISOString(),
    rang_at: null,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'missed',
    missed_reason: 'phone_off',
    ...change,
  });
}

function linkOf(change: Partial<PlannerWatchLink>): PlannerWatchLink {
  return { deviceId: WATCH, alarmId: 3, hash: 'h', state: 'synced', detail: null, ...change };
}

describe('nextRingOf', () => {
  it('finds the next repeat day after now', () => {
    const gym = alarmOf({ time: '06:15', days: [2, 4] });
    expect(nextRingOf(gym, NOW, ZONE)).toBe(zonedInstant('2026-11-10', 6 * 60 + 15, ZONE));
  });

  it('passes over a skipped day', () => {
    const wake = alarmOf({ skip_on: '2026-11-08' });
    expect(nextRingOf(wake, NOW, ZONE)).toBe(zonedInstant('2026-11-09', 7 * 60, ZONE));
  });

  it('rings later today when the time is still ahead', () => {
    const late = alarmOf({ time: '22:00', days: [] });
    expect(nextRingOf(late, NOW, ZONE)).toBe(zonedInstant('2026-11-07', 22 * 60, ZONE));
  });

  it('has no next ring when off or when a once date has passed', () => {
    expect(nextRingOf(alarmOf({ enabled: false }), NOW, ZONE)).toBeNull();
    expect(nextRingOf(alarmOf({ days: [], once_on: '2026-11-06' }), NOW, ZONE)).toBeNull();
  });

  it('rings once on its date', () => {
    const parcel = alarmOf({ time: '13:30', days: [], once_on: '2026-11-09' });
    expect(nextRingOf(parcel, NOW, ZONE)).toBe(zonedInstant('2026-11-09', 13 * 60 + 30, ZONE));
  });
});

describe('countdownOf', () => {
  it('reads hours and minutes inside a day', () => {
    expect(countdownOf(NOW + 16 * HOUR + 40 * MINUTE, NOW)).toBe('16 h 40 min');
    expect(countdownOf(NOW + 3 * HOUR, NOW)).toBe('3 h');
    expect(countdownOf(NOW + 25 * 1000, NOW)).toBe('1 min');
  });

  it('reads one day and hours, then whole days', () => {
    expect(countdownOf(NOW + DAY + 15 * HOUR + 30 * MINUTE, NOW)).toBe('1 day 15 h');
    expect(countdownOf(NOW + DAY, NOW)).toBe('1 day');
    expect(countdownOf(NOW + 2 * DAY + 15 * HOUR, NOW)).toBe('2 days');
  });
});

describe('nextRingTextOf', () => {
  it('names the day and the countdown', () => {
    expect(nextRingTextOf(alarmOf({}), NOW, ZONE)).toBe('Tomorrow, in 16 h 40 min');
    expect(nextRingTextOf(alarmOf({ time: '06:15', days: [2, 4] }), NOW, ZONE)).toBe(
      'Tuesday, in 2 days',
    );
    expect(nextRingTextOf(alarmOf({ time: '05:50', days: [1, 3, 5] }), NOW, ZONE)).toBe(
      'Monday, in 1 day 15 h',
    );
    expect(nextRingTextOf(alarmOf({ time: '22:00', days: [] }), NOW, ZONE)).toBe(
      'Today, in 7 h 40 min',
    );
  });

  it('says Off for an alarm that is off', () => {
    expect(nextRingTextOf(alarmOf({ enabled: false }), NOW, ZONE)).toBe('Off');
  });

  it('names a date a week or more ahead', () => {
    const later = zonedInstant('2026-11-16', 7 * 60, ZONE);
    expect(dayWordOf(later, NOW, ZONE)).toBe('Monday 16 Nov');
  });
});

describe('repeatTextOf', () => {
  it('names a once date', () => {
    expect(repeatTextOf(alarmOf({ days: [], once_on: '2026-11-09' }), MONDAY)).toBe(
      'Monday 9 Nov, once',
    );
  });

  it('names common day sets', () => {
    expect(repeatTextOf(alarmOf({}), MONDAY)).toBe('Every day');
    expect(repeatTextOf(alarmOf({ days: [5, 1, 2, 3, 4] }), MONDAY)).toBe('Weekdays');
    expect(repeatTextOf(alarmOf({ days: [6, 0] }), MONDAY)).toBe('Weekends');
    expect(repeatTextOf(alarmOf({ days: [] }), MONDAY)).toBe('Once');
  });

  it('lists other days in week order', () => {
    expect(repeatTextOf(alarmOf({ days: [0, 4, 2] }), MONDAY)).toBe('Tue, Thu, Sun');
    expect(repeatTextOf(alarmOf({ days: [0, 4, 2] }), 0)).toBe('Sun, Tue, Thu');
  });
});

describe('soonest alarm', () => {
  const wake = alarmOf({});
  const gym = alarmOf({ time: '06:15', days: [2, 4] });
  const late = alarmOf({ time: '22:00', days: [] });
  const off = alarmOf({ time: '05:00', enabled: false });

  it('picks the alarm that rings first', () => {
    expect(soonestAlarmOf([wake, gym, late, off], NOW, ZONE)?.alarm.id).toBe(late.id);
  });

  it('writes the page subtitle', () => {
    expect(alarmsSubtitleOf([wake, gym, off], NOW, ZONE)).toBe(
      'Next alarm 07:00 · Tomorrow, in 16 h 40 min · 2 on',
    );
    expect(alarmsSubtitleOf([off], NOW, ZONE)).toBe('No alarms on');
    expect(alarmsSubtitleOf([], NOW, ZONE)).toBeNull();
  });

  it('orders cards by next ring with alarms that are off last', () => {
    expect(alarmsInRingOrder([off, gym, wake, late], NOW, ZONE).map((alarm) => alarm.id)).toEqual([
      late.id,
      wake.id,
      gym.id,
      off.id,
    ]);
  });
});

describe('skipDayOf', () => {
  it('names the day the next ring falls on, ignoring a skip already set', () => {
    expect(skipDayOf(alarmOf({}), NOW, ZONE)).toBe('Sunday');
    expect(skipDayOf(alarmOf({ skip_on: '2026-11-08' }), NOW, ZONE)).toBe('Sunday');
  });

  it('offers no skip for a once alarm', () => {
    expect(skipDayOf(alarmOf({ days: [], once_on: '2026-11-09' }), NOW, ZONE)).toBeNull();
    expect(skipDayOf(alarmOf({ days: [] }), NOW, ZONE)).toBeNull();
  });
});

describe('wakeRoutineTimeOf', () => {
  it('starts the routine its lead before the alarm', () => {
    expect(wakeRoutineTimeOf(alarmOf({ wake_scene_id: SCENE, wake_lead_minutes: 20 }))).toBe(
      '06:40',
    );
    expect(
      wakeRoutineTimeOf(alarmOf({ time: '00:10', wake_scene_id: SCENE, wake_lead_minutes: 20 })),
    ).toBe('23:50');
    expect(wakeRoutineTimeOf(alarmOf({}))).toBeNull();
  });
});

describe('watchLineOf', () => {
  it('words every watch state with its tone', () => {
    expect(watchLineOf(linkOf({}), 'Watch')).toEqual({
      title: 'Watch · synced',
      detail: null,
      tone: 'positive',
    });
    expect(
      watchLineOf(
        linkOf({ state: 'pending', detail: 'Saves when the phone is near the watch.' }),
        'Watch',
      ),
    ).toEqual({
      title: 'Watch · waiting for the phone',
      detail: 'Saves when the phone is near the watch.',
      tone: 'warning',
    });
    expect(
      watchLineOf(linkOf({ state: 'failed', detail: 'The watch list is full.' }), 'Watch'),
    ).toEqual({ title: 'Watch · not saved', detail: 'The watch list is full.', tone: 'critical' });
    expect(
      watchLineOf(linkOf({ state: 'not_on_watch', detail: 'Repeats every second week.' }), 'Watch'),
    ).toEqual({ title: 'Not on Watch', detail: 'Repeats every second week.', tone: 'faint' });
  });

  it('puts a dot on the chip for every state but not on watch', () => {
    expect(watchDotOf('synced')).toBe('positive');
    expect(watchDotOf('pending')).toBe('warning');
    expect(watchDotOf('failed')).toBe('critical');
    expect(watchDotOf('not_on_watch')).toBeNull();
  });
});

describe('missed alarms', () => {
  it('keeps only missed alarm rings', () => {
    const missed = ringOf({});
    const rang = ringOf({
      outcome: 'rang',
      missed_reason: null,
      rang_at: missed.due_at,
    });
    const timer = ringOf({ kind: 'timer' });
    expect(missedAlarmsOf([missed, rang, timer])).toEqual([missed]);
  });

  it('says when it was missed and why', () => {
    const ring = ringOf({});
    expect(missedPillOf(ring.due_at, NOW, ZONE)).toBe('Missed today');
    expect(missedPillOf(ring.due_at, NOW + DAY, ZONE)).toBe('Missed yesterday');
    expect(missedStoryOf(ring, ZONE)).toMatch(
      /^The phone was off at .+\. Clock doesn’t ring alarms late, so this one is marked missed\.$/,
    );
  });
});
