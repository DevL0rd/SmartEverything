import {
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_ROW,
  PLANNER_RING_ROW,
  PLANNER_STATS,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerRingRow,
  type PlannerStats,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { shiftDay, startOfDayKey } from '../../../format/time';
import { alarmSummaryOf, hasAlarmData, ringWindowOf, spreadWordsOf } from './alarm-model';
import { habitViewsOf } from './habit-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const LIST = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const ALARM = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SECOND = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const STAMP = '2026-11-01T08:00:00.000Z';
const LAST = '2026-11-08';
const DAYS = Array.from({ length: 7 }, (_, index) => shiftDay(LAST, index - 6));
const HOUR_MS = 3_600_000;

let next = 300;

function idOf(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function statsOf(alarms: PlannerStats['alarms'] = []): PlannerStats {
  return PLANNER_STATS.parse({
    range: 'week',
    from: DAYS[0],
    to: LAST,
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: DAYS.map((day) => ({ day, scheduled_minutes: 0, items: 0 })),
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [],
    timer_use: [],
    alarms,
  });
}

function at(day: string, hours: number): string {
  return new Date(startOfDayKey(day) + hours * HOUR_MS).toISOString();
}

function ring(day: string, snoozes: number, outcome: 'rang' | 'missed' = 'rang'): PlannerRingRow {
  const due = at(day, 7);
  return PLANNER_RING_ROW.parse({
    id: idOf(),
    kind: 'alarm',
    ref_id: ALARM,
    profile_id: PROFILE,
    due_at: due,
    rang_at: outcome === 'rang' ? due : null,
    dismissed_at: outcome === 'rang' ? at(day, 7.2) : null,
    snoozes,
    target: null,
    outcome,
    missed_reason: outcome === 'missed' ? 'phone_off' : null,
  });
}

function alarm(
  id: string,
  rang: number,
  spread: number | null,
  extra: Partial<PlannerStats['alarms'][number]> = {},
): PlannerStats['alarms'][number] {
  return {
    alarm_id: id,
    rang,
    missed: 0,
    snoozes: 0,
    average_minute: 420,
    spread_minutes: spread,
    ...extra,
  };
}

describe('the insights alarm card', () => {
  it('weights the wake time spread by how often each alarm rang', () => {
    const stats = statsOf([alarm(ALARM, 3, 10), alarm(SECOND, 1, 30)]);
    expect(alarmSummaryOf(stats, []).spread).toBe(15);
    expect(spreadWordsOf(15)).toBe('± 15');
    expect(spreadWordsOf(null)).toBe('–');
  });

  it('counts the days up on time and the snoozes per day inside the range', () => {
    const stats = statsOf([alarm(ALARM, 3, 5, { snoozes: 3, missed: 1 })]);
    const rings = [
      ring(DAYS[0] ?? LAST, 0),
      ring(DAYS[1] ?? LAST, 2),
      ring(DAYS[1] ?? LAST, 1),
      ring(DAYS[2] ?? LAST, 0, 'missed'),
      ring(shiftDay(DAYS[0] ?? LAST, -1), 4),
    ];
    const summary = alarmSummaryOf(stats, rings);
    expect(summary).toMatchObject({ snoozes: 3, missed: 1, upOnTime: 1, ringDays: 3 });
    expect(summary.snoozeBars.map((bar) => bar.value)).toEqual([0, 3, 0, 0, 0, 0, 0]);
    expect(hasAlarmData(summary)).toBe(true);
  });

  it('has nothing to show when no alarm rang', () => {
    expect(hasAlarmData(alarmSummaryOf(statsOf(), []))).toBe(false);
  });

  it('asks for the rings from the first midnight to the midnight after the last day', () => {
    const window = ringWindowOf(statsOf());
    expect(window.from).toBe(new Date(startOfDayKey(DAYS[0] ?? LAST)).toISOString());
    expect(window.to).toBe(new Date(startOfDayKey(shiftDay(LAST, 1))).toISOString());
  });
});

function task(title: string, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: idOf(),
    profile_id: PROFILE,
    collection_id: LIST,
    kind: 'task',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-01T07:30:00',
    end_local: null,
    time_zone: 'Europe/Berlin',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: 'FREQ=DAILY',
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

function done(item: PlannerItemRow, day: string): PlannerOccurrenceRow {
  const key = at(day, 7);
  return PLANNER_OCCURRENCE_ROW.parse({
    item_id: item.id,
    occurrence_key: key,
    status: 'done',
    completed_at: key,
    completed_by: 'person',
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
}

describe('the insights habits card', () => {
  it('lists open repeating tasks in order with the range done and the streak', () => {
    const brush = task('Brush teeth', { position: 1 });
    const walk = task('Treadmill walk', { position: 0 });
    const once = task('Pay rent', { rrule: null });
    const closed = task('Old habit', { status: 'done' });
    const rows = [done(brush, DAYS[5] ?? LAST), done(brush, LAST), done(brush, '2026-10-01')];
    const views = habitViewsOf([brush, walk, once, closed], rows, DAYS);
    expect(views.map((view) => view.item.title)).toEqual(['Treadmill walk', 'Brush teeth']);
    const [, brushView] = views;
    expect(brushView?.done).toBe(2);
    expect(brushView?.streak.current).toBe(3);
    expect(brushView?.heat.filter((day) => day.level > 0).map((day) => day.day)).toEqual([
      DAYS[5],
      LAST,
    ]);
  });
});
