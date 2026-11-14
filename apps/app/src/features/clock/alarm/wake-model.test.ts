import {
  PLANNER_RING_ROW,
  PLANNER_STATS,
  type PlannerRingRow,
  type PlannerStats,
  type PlannerStatsRange,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clockOfMinutes, shiftDay, zonedInstant } from '../../../format/time';
import { hasWakeData, wakeInsightsOf, wakeScaleOf, wakeSpokenOf } from './wake-model';

const ZONE = 'Europe/Berlin';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const ALARM = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const LAST = '2026-11-08';

let next = 500;

function idOf(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function daysOf(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(LAST, index - count + 1));
}

function statsOf(range: PlannerStatsRange, count: number): PlannerStats {
  const days = daysOf(count);
  return PLANNER_STATS.parse({
    range,
    from: days[0],
    to: LAST,
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: days.map((day) => ({ day, scheduled_minutes: 0, items: 0 })),
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [],
    timer_use: [],
    alarms: [],
  });
}

function iso(day: string, minute: number): string {
  return new Date(zonedInstant(day, minute, ZONE)).toISOString();
}

interface RingShape {
  readonly day: string;
  readonly due: number;
  readonly up?: number;
  readonly snoozes?: number;
  readonly missed?: boolean;
  readonly kind?: 'alarm' | 'timer';
}

function ringOf(shape: RingShape): PlannerRingRow {
  const missed = shape.missed === true;
  return PLANNER_RING_ROW.parse({
    id: idOf(),
    kind: shape.kind ?? 'alarm',
    ref_id: ALARM,
    profile_id: PROFILE,
    due_at: iso(shape.day, shape.due),
    rang_at: missed ? null : iso(shape.day, shape.due),
    dismissed_at: missed || shape.up === undefined ? null : iso(shape.day, shape.up),
    snoozes: shape.snoozes ?? 0,
    target: null,
    outcome: missed ? 'missed' : 'rang',
    missed_reason: missed ? 'phone_off' : null,
  });
}

describe('wakeInsightsOf', () => {
  it('pairs each day’s first alarm with the time it was stopped, in the planner zone', () => {
    const rings = [
      ringOf({ day: LAST, due: 7 * 60, up: 7 * 60 + 12 }),
      ringOf({ day: LAST, due: 13 * 60 + 30, up: 13 * 60 + 31 }),
      ringOf({ day: shiftDay(LAST, -1), due: 6 * 60 + 15, up: 6 * 60 + 15 }),
    ];
    const insights = wakeInsightsOf(statsOf('week', 7), rings, ZONE);
    expect(insights.buckets).toHaveLength(7);
    expect(insights.buckets.at(-1)).toMatchObject({ key: LAST, alarm: 420, wake: 432 });
    expect(insights.buckets.at(-2)).toMatchObject({ alarm: 375, wake: 375 });
    expect(insights.buckets[0]).toMatchObject({ alarm: null, wake: null });
  });

  it('takes the ring time as the wake time when nobody stopped the alarm', () => {
    const insights = wakeInsightsOf(statsOf('week', 7), [ringOf({ day: LAST, due: 7 * 60 })], ZONE);
    expect(insights.buckets.at(-1)).toMatchObject({ alarm: 420, wake: 420 });
  });

  it('averages the days of a week bucket on month and year ranges', () => {
    const days = daysOf(14);
    const rings = [
      ringOf({ day: days[13] ?? LAST, due: 7 * 60, up: 7 * 60 + 10 }),
      ringOf({ day: days[12] ?? LAST, due: 7 * 60 + 20, up: 7 * 60 + 40 }),
    ];
    const insights = wakeInsightsOf(statsOf('month', 14), rings, ZONE);
    expect(insights.buckets).toHaveLength(2);
    expect(insights.buckets[1]).toMatchObject({ key: days[7], alarm: 430, wake: 445 });
    expect(insights.buckets[0]).toMatchObject({ alarm: null, wake: null });
  });

  it('ignores missed rings and timer rings in the chart and counts minutes lost to snoozing', () => {
    const rings = [
      ringOf({ day: LAST, due: 7 * 60, up: 7 * 60 + 18, snoozes: 2 }),
      ringOf({ day: shiftDay(LAST, -1), due: 7 * 60, up: 7 * 60, snoozes: 0 }),
      ringOf({ day: shiftDay(LAST, -2), due: 7 * 60, missed: true }),
      ringOf({ day: shiftDay(LAST, -3), due: 5 * 60, up: 5 * 60 + 1, kind: 'timer' }),
      ringOf({ day: shiftDay(LAST, -4), due: 6 * 60, up: 6 * 60 + 6, snoozes: 1 }),
    ];
    const insights = wakeInsightsOf(statsOf('week', 7), rings, ZONE);
    expect(insights.snoozes).toBe(0);
    expect(insights.lostAverage).toBe(12);
    expect(insights.buckets.at(-3)).toMatchObject({ alarm: null });
    expect(insights.buckets.at(-4)).toMatchObject({ alarm: null });
  });

  it('has no minutes lost when no alarm was snoozed', () => {
    const insights = wakeInsightsOf(
      statsOf('week', 7),
      [ringOf({ day: LAST, due: 7 * 60, up: 7 * 60 })],
      ZONE,
    );
    expect(insights.lostAverage).toBeNull();
    expect(hasWakeData(insights)).toBe(true);
  });

  it('reports no wake data for a range without rings', () => {
    expect(hasWakeData(wakeInsightsOf(statsOf('week', 7), [], ZONE))).toBe(false);
  });
});

describe('wakeScaleOf', () => {
  it('spans whole hours around every alarm and wake time', () => {
    const scale = wakeScaleOf([
      { key: 'a', label: 'Mon', alarm: 375, wake: 390 },
      { key: 'b', label: 'Tue', alarm: 420, wake: 485 },
      { key: 'c', label: 'Wed', alarm: null, wake: null },
    ]);
    expect(scale).toEqual({ from: 360, to: 540, ticks: [360, 420, 480, 540] });
  });

  it('widens a scale on an exact hour to one hour', () => {
    expect(wakeScaleOf([{ key: 'a', label: 'Mon', alarm: 420, wake: 420 }])).toEqual({
      from: 420,
      to: 480,
      ticks: [420, 480],
    });
  });

  it('has no scale without any time', () => {
    expect(wakeScaleOf([{ key: 'a', label: 'Mon', alarm: null, wake: null }])).toBeNull();
  });
});

describe('wakeSpokenOf', () => {
  it('names the alarm and wake times of a bucket', () => {
    expect(wakeSpokenOf({ key: 'a', label: 'Mon', alarm: 420, wake: 432 }, clockOfMinutes)).toBe(
      'Mon: alarm 07:00, awake 07:12',
    );
    expect(wakeSpokenOf({ key: 'a', label: 'Tue', alarm: null, wake: null }, clockOfMinutes)).toBe(
      'Tue: no alarm rang',
    );
  });
});
