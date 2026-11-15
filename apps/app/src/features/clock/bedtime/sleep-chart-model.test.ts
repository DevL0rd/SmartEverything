import { PLANNER_BEDTIME, type PlannerBedtime, type PlannerSleep } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  driftTextOf,
  plannedNightOf,
  sleepColumnsOf,
  sleepDatesOf,
  sleepFactsOf,
  sleepSummaryOf,
  sleepWindowOf,
} from './sleep-chart-model';

const ZONE = 'Europe/Berlin';

const TODAY = '2026-11-14';

const BEDTIME: PlannerBedtime = PLANNER_BEDTIME.parse({
  enabled: true,
  schedule: [
    { days: [0, 1, 2, 3, 4], bed: '22:45', wake: '06:30' },
    { days: [5, 6], bed: '23:45', wake: '08:00' },
  ],
  reminder_minutes: 30,
  wind_down_minutes: 45,
  wind_down_automation_id: null,
  do_not_disturb: true,
  sleep_sound: null,
});

const SLEEP: PlannerSleep = {
  nights: [
    {
      date: '2026-11-14',
      bed_at: '2026-11-13T23:15:00.000Z',
      woke_at: '2026-11-14T07:10:00.000Z',
      asleep_minutes: 450,
    },
    {
      date: '2026-11-13',
      bed_at: '2026-11-12T21:45:00.000Z',
      woke_at: '2026-11-13T05:30:00.000Z',
      asleep_minutes: 430,
    },
  ],
  week_average_minutes: 421,
};

describe('the sleep chart', () => {
  it('covers a week or a month of mornings ending today', () => {
    expect(sleepDatesOf('week', TODAY)).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
    expect(sleepDatesOf('month', TODAY)).toHaveLength(30);
    expect(sleepWindowOf('week', TODAY, ZONE)).toEqual({
      from: '2026-11-07T11:00:00.000Z',
      to: '2026-11-14T23:00:00.000Z',
    });
  });

  it('plans each morning from the night before it', () => {
    expect(plannedNightOf(BEDTIME, '2026-11-14')).toEqual({ bed: 1425, wake: 480 });
    expect(plannedNightOf(BEDTIME, '2026-11-13')).toEqual({ bed: 1365, wake: 390 });
    expect(plannedNightOf({ ...BEDTIME, enabled: false }, '2026-11-13')).toBeNull();
    expect(
      plannedNightOf({ ...BEDTIME, schedule: [{ days: [6], bed: '01:00', wake: '09:00' }] }, TODAY),
    ).toEqual({ bed: 60, wake: 540 });
  });

  it('puts each recorded night in its column in the home time zone', () => {
    const columns = sleepColumnsOf({
      sleep: SLEEP,
      bedtime: BEDTIME,
      span: 'week',
      today: TODAY,
      zone: ZONE,
    });
    expect(columns).toHaveLength(7);
    expect(columns.at(-1)?.night).toEqual({ bed: 15, wake: 490, asleepMinutes: 450 });
    expect(columns.at(-2)?.night).toEqual({ bed: 1365, wake: 390, asleepMinutes: 430 });
    expect(columns[0]?.night).toBeNull();
    expect(columns[0]?.planned).toEqual({ bed: 1425, wake: 480 });
  });

  it('compares the nights with the plan', () => {
    const columns = sleepColumnsOf({
      sleep: SLEEP,
      bedtime: BEDTIME,
      span: 'week',
      today: TODAY,
      zone: ZONE,
    });
    const facts = sleepFactsOf(SLEEP, columns);
    expect(facts).toEqual({
      recorded: 2,
      total: 7,
      averageAsleep: 440,
      weekAverage: 421,
      bedDrift: 15,
      wakeDrift: 5,
    });
    expect(driftTextOf(facts.bedDrift)).toBe('15 min later');
    expect(driftTextOf(-75)).toBe('1 h 15 min earlier');
    expect(driftTextOf(0)).toBe('On plan');
    expect(driftTextOf(null)).toBe('No plan to compare');
    expect(sleepSummaryOf(facts, 'week')).toBe(
      '2 of 7 nights recorded, 7 h 20 min asleep on average, in bed 15 min later than planned.',
    );
  });

  it('has nothing to compare with no sleep data', () => {
    const empty = { nights: [], week_average_minutes: null };
    const columns = sleepColumnsOf({
      sleep: empty,
      bedtime: BEDTIME,
      span: 'week',
      today: TODAY,
      zone: ZONE,
    });
    const facts = sleepFactsOf(empty, columns);
    expect(facts.recorded).toBe(0);
    expect(facts.averageAsleep).toBeNull();
    expect(facts.bedDrift).toBeNull();
    expect(sleepSummaryOf(facts, 'month')).toBe('No sleep recorded this month.');
  });
});
