import {
  PLANNER_ALARM_ROW,
  PLANNER_BEDTIME,
  type PlannerAlarmRow,
  type PlannerBedtime,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  addedNight,
  daysTextOf,
  freeDaysOf,
  leadOptionsOf,
  nextNightOf,
  nightsInOrder,
  removedNight,
  startedBedtime,
  toggledNightDay,
  tonightLineOf,
  wakeAlarmBodyOf,
  wakeAlarmOf,
  wakeDaysOf,
  withNightTimes,
} from './schedule-model';

const ZONE = 'Europe/Berlin';

const SCHOOL = { days: [0, 1, 2, 3, 4], bed: '22:45', wake: '06:30' } as const;

const WEEKEND = { days: [5, 6], bed: '23:45', wake: '08:00' } as const;

const BEDTIME: PlannerBedtime = PLANNER_BEDTIME.parse({
  enabled: true,
  schedule: [SCHOOL, WEEKEND],
  reminder_minutes: 30,
  wind_down_minutes: 45,
  wind_down_automation_id: null,
  do_not_disturb: true,
  sleep_sound: null,
});

const AT = '2026-11-01T00:00:00.000Z';

function alarm(time: string, days: readonly number[], enabled = true): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: `00000000-0000-4000-8000-0000000000${String(days.length).padStart(2, '0')}`,
    profile_id: '00000000-0000-4000-8000-000000000002',
    label: null,
    time,
    days,
    once_on: null,
    skip_on: null,
    enabled,
    sound: { kind: 'tone', id: 'default' },
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    snooze_limit: null,
    challenge: { kind: 'none' },
    sunrise: null,
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
    created_at: AT,
    updated_at: AT,
  });
}

describe('the bedtime schedule', () => {
  it('names day groups by runs in the week order', () => {
    expect(daysTextOf([0, 1, 2, 3, 4], 0)).toBe('Sun\u00a0–\u00a0Thu');
    expect(daysTextOf([0, 1, 2, 3, 4], 1)).toBe('Mon\u00a0–\u00a0Thu, Sun');
    expect(daysTextOf([5, 6], 1)).toBe('Fri, Sat');
    expect(daysTextOf([0, 1, 2, 3, 4, 5, 6], 1)).toBe('Every night');
    expect(daysTextOf([], 1)).toBe('No nights');
  });

  it('orders the nights by their first day and lists the days without a bedtime', () => {
    expect(nightsInOrder([WEEKEND, SCHOOL], 1).map((night) => night.bed)).toEqual([
      '22:45',
      '23:45',
    ]);
    expect(freeDaysOf([WEEKEND])).toEqual([0, 1, 2, 3, 4]);
    expect(freeDaysOf(BEDTIME.schedule)).toEqual([]);
  });

  it('changes the times of one night only', () => {
    const changed = withNightTimes(BEDTIME.schedule, 1, { bed: 0, wake: 9 * 60 });
    expect(changed).toEqual([SCHOOL, { days: [5, 6], bed: '00:00', wake: '09:00' }]);
  });

  it('moves a day between nights and drops a night with no days left', () => {
    const moved = toggledNightDay(BEDTIME.schedule, 1, 4);
    expect(moved).toEqual([
      { ...SCHOOL, days: [0, 1, 2, 3] },
      { ...WEEKEND, days: [4, 5, 6] },
    ]);
    const single = [{ ...WEEKEND, days: [5] }];
    expect(toggledNightDay(single, 0, 5)).toEqual([]);
  });

  it('adds nights by taking their days from the others and removes a night', () => {
    const added = addedNight(BEDTIME.schedule, [4, 5], { bed: 23 * 60, wake: 7 * 60 });
    expect(added).toEqual([
      { ...SCHOOL, days: [0, 1, 2, 3] },
      { ...WEEKEND, days: [6] },
      { days: [4, 5], bed: '23:00', wake: '07:00' },
    ]);
    expect(addedNight(BEDTIME.schedule, [], { bed: 0, wake: 60 })).toBe(BEDTIME.schedule);
    expect(removedNight(BEDTIME.schedule, 0)).toEqual([WEEKEND]);
  });
});

describe('the wake alarm of a night', () => {
  it('rings the morning after when the night crosses midnight', () => {
    expect(wakeDaysOf(SCHOOL)).toEqual([1, 2, 3, 4, 5]);
    expect(wakeDaysOf({ days: [6], bed: '01:00', wake: '09:00' })).toEqual([6]);
    expect(wakeAlarmBodyOf(SCHOOL)).toEqual({
      time: '06:30',
      days: [1, 2, 3, 4, 5],
      label: 'Wake up',
    });
  });

  it('links the alarm at the wake time on the same mornings and nothing else', () => {
    const weekdays = alarm('06:30', [1, 2, 3, 4, 5]);
    expect(wakeAlarmOf([alarm('07:00', [1, 2, 3, 4, 5]), weekdays], SCHOOL)).toBe(weekdays);
    expect(wakeAlarmOf([alarm('06:30', [1, 2, 3])], SCHOOL)).toBeNull();
  });

  it('starts a bedtime from the first repeating alarm, eight hours before it', () => {
    const off = { ...BEDTIME, enabled: false, schedule: [] };
    expect(startedBedtime(off, [alarm('06:30', [1, 2, 3, 4, 5])]).schedule).toEqual([
      { days: [0, 1, 2, 3, 4], bed: '22:30', wake: '06:30' },
    ]);
    expect(startedBedtime(off, []).schedule).toEqual([
      { days: [0, 1, 2, 3, 4, 5, 6], bed: '23:00', wake: '07:00' },
    ]);
    expect(startedBedtime({ ...BEDTIME, enabled: false }, []).schedule).toBe(BEDTIME.schedule);
    expect(startedBedtime(off, []).enabled).toBe(true);
  });
});

describe('tonight', () => {
  const saturdayMorning = Date.parse('2026-11-14T10:00:00Z');

  it('finds the next night with its wind-down and wake moments', () => {
    const next = nextNightOf(BEDTIME, saturdayMorning, ZONE);
    expect(next?.night).toEqual(WEEKEND);
    expect(new Date(next?.bedAt ?? 0).toISOString()).toBe('2026-11-14T22:45:00.000Z');
    expect(new Date(next?.windDownAt ?? 0).toISOString()).toBe('2026-11-14T22:00:00.000Z');
    expect(new Date(next?.wakeAt ?? 0).toISOString()).toBe('2026-11-15T07:00:00.000Z');
    expect(nextNightOf({ ...BEDTIME, enabled: false }, saturdayMorning, ZONE)).toBeNull();
  });

  it('says what comes next tonight', () => {
    const next = nextNightOf(BEDTIME, saturdayMorning, ZONE);
    expect(tonightLineOf(next, saturdayMorning)).toBe('Bedtime in 12 h 45 min');
    expect(tonightLineOf(next, Date.parse('2026-11-14T22:10:00Z'))).toBe(
      'Wind-down · bed at 23:45',
    );
    expect(tonightLineOf(next, Date.parse('2026-11-15T01:00:00Z'))).toBe(
      'Sleep time · wake at 08:00',
    );
    expect(tonightLineOf(null, saturdayMorning)).toBe('No bedtime set');
  });

  it('offers reminder and wind-down leads with the current one kept', () => {
    const options = leadOptionsOf(25);
    expect(options[0]).toEqual({ value: 'off', label: 'Off' });
    expect(options.map((option) => option.value)).toContain('25');
    expect(options.find((option) => option.value === '60')?.label).toBe('1 h before');
    expect(options.find((option) => option.value === '90')?.label).toBe('1 h 30 min before');
  });
});
