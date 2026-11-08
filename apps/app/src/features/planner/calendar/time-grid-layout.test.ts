import {
  PLANNER_ALARM_ROW,
  PLANNER_COLLECTION_ROW,
  type PlannerAlarmRow,
  type PlannerCollectionRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import {
  DAY_MINUTES,
  alarmPinsOf,
  allDayOn,
  gridDaysOf,
  laneSpans,
  nowPlaceOf,
  timedSpansOn,
  wallMinuteOf,
  workingWindowOn,
  type GridSpan,
} from './time-grid-layout';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const WORK = 'a1b2c3d4-0000-4000-8000-000000000002';
const ALARM = 'a1b2c3d4-0000-4000-8000-000000000003';
const ZONE = 'Europe/Berlin';
const STAMP = '2026-11-01T00:00:00.000Z';
const SATURDAY = '2026-11-07';
const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';

let next = 0;

function item(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(100 + next).padStart(12, '0')}`;
}

function event(
  title: string,
  start: string | null,
  end: string | null,
  extra: Partial<PlannerOccurrenceView> = {},
): PlannerOccurrenceView {
  return {
    item_id: item(),
    occurrence_key: 'single',
    collection_id: WORK,
    kind: 'event',
    title,
    location: null,
    priority: null,
    all_day: false,
    start,
    end,
    due_at: null,
    due_date: null,
    status: 'open',
    recurring: false,
    moved: false,
    completed_at: null,
    completed_by: null,
    evidence: null,
    attachments: [],
    google_state: null,
    ...extra,
  };
}

function span(key: string, from: number, to: number): GridSpan {
  return { key, occurrence: event(key, null, null), from, to };
}

function work(): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: WORK,
    profile_id: PROFILE,
    kind: 'calendar',
    name: 'Work',
    colour: 'work',
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function alarm(patch: Partial<PlannerAlarmRow>): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: ALARM,
    profile_id: PROFILE,
    label: 'Wake up',
    time: '07:00',
    days: [],
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
    created_at: STAMP,
    updated_at: STAMP,
    ...patch,
  });
}

function lanesByKey(spans: readonly GridSpan[], minMinutes = 0): Record<string, string> {
  return Object.fromEntries(
    laneSpans(spans, minMinutes).map((laned) => [
      laned.key,
      `${String(laned.lane)}/${String(laned.lanes)}x${String(laned.width)}`,
    ]),
  );
}

describe('overlap lanes', () => {
  it('gives events that do not touch the full width', () => {
    expect(lanesByKey([span('a', 540, 600), span('b', 600, 660)])).toEqual({
      a: '0/1x1',
      b: '0/1x1',
    });
  });

  it('splits overlapping events into side by side lanes', () => {
    expect(lanesByKey([span('a', 540, 660), span('b', 570, 630)])).toEqual({
      a: '0/2x1',
      b: '1/2x1',
    });
  });

  it('reuses a free lane and widens a block over lanes that are free beside it', () => {
    const spans = [span('long', 540, 720), span('first', 540, 600), span('later', 600, 660)];
    const third = span('third', 545, 590);
    expect(lanesByKey([...spans, third])).toEqual({
      long: '0/3x1',
      first: '1/3x1',
      third: '2/3x1',
      later: '1/3x2',
    });
  });

  it('keeps separate clusters independent', () => {
    const lanes = lanesByKey([span('a', 540, 600), span('b', 550, 610), span('c', 700, 760)]);
    expect(lanes['c']).toBe('0/1x1');
    expect(lanes['a']).toBe('0/2x1');
  });

  it('lets a very short event take the space it is drawn with', () => {
    expect(lanesByKey([span('tap', 600, 600), span('next', 610, 640)], 30)).toEqual({
      tap: '0/2x1',
      next: '1/2x1',
    });
  });
});

describe('timed spans', () => {
  it('places an event at its wall clock minutes in the zone', () => {
    const lunch = event('Lunch', '2026-11-07T11:30:00.000Z', '2026-11-07T12:30:00.000Z');
    const [placed] = timedSpansOn([lunch], SATURDAY, ZONE);
    expect(placed).toMatchObject({ from: 750, to: 810 });
  });

  it('splits an event that runs past midnight over both days', () => {
    const party = event('Party', '2026-11-07T21:00:00.000Z', '2026-11-07T23:30:00.000Z');
    expect(timedSpansOn([party], SATURDAY, ZONE)[0]).toMatchObject({ from: 1320, to: DAY_MINUTES });
    expect(timedSpansOn([party], SUNDAY, ZONE)[0]).toMatchObject({ from: 0, to: 30 });
  });

  it('shows a task with a due time and skips cancelled and all day items', () => {
    const due = event('Recycling', null, null, {
      kind: 'task',
      due_at: '2026-11-07T16:00:00.000Z',
    });
    const cancelled = event('Gone', '2026-11-07T09:00:00.000Z', null, { status: 'cancelled' });
    const allDay = event('Bin day', '2026-11-06T23:00:00.000Z', '2026-11-07T23:00:00.000Z', {
      all_day: true,
    });
    const spans = timedSpansOn([due, cancelled, allDay], SATURDAY, ZONE);
    expect(spans.map((placed) => placed.occurrence.title)).toEqual(['Recycling']);
    expect(spans[0]).toMatchObject({ from: 1020, to: 1020 });
  });

  it('reads wall minutes across the autumn clock change', () => {
    expect(wallMinuteOf(Date.parse('2026-10-25T02:30:00.000Z'), ZONE)).toBe(210);
  });
});

describe('grid days', () => {
  it('marks proposed and read only blocks and colours them by calendar', () => {
    const birthday = event('Alex birthday', '2026-11-07T10:00:00.000Z', '2026-11-07T11:00:00.000Z');
    const proposal = event('Descale', '2026-11-07T15:30:00.000Z', '2026-11-07T16:00:00.000Z', {
      status: 'proposed',
    });
    const [day] = gridDaysOf({
      days: [SATURDAY],
      timeZone: ZONE,
      today: SATURDAY,
      occurrences: [birthday, proposal],
      collections: [work()],
      workingHours: null,
      readOnlyOf: (occurrence) => occurrence.item_id === birthday.item_id,
      minMinutes: 0,
    });
    expect(day?.today).toBe(true);
    expect(
      day?.blocks.map((block) => [block.occurrence.title, block.readOnly, block.proposed]),
    ).toEqual([
      ['Alex birthday', true, false],
      ['Descale', false, true],
    ]);
    expect(day?.blocks[0]?.colour).toBe('work');
    const from = clock('2026-11-07T10:00:00.000Z', ZONE);
    expect(day?.blocks[0]?.time).toBe(`${from} to ${clock('2026-11-07T11:00:00.000Z', ZONE)}`);
  });

  it('renders only the days it is given', () => {
    const days = gridDaysOf({
      days: [SATURDAY, SUNDAY, MONDAY],
      timeZone: ZONE,
      today: SUNDAY,
      occurrences: [],
      collections: [],
      workingHours: null,
      readOnlyOf: () => false,
      minMinutes: 0,
    });
    expect(days.map((day) => day.date)).toEqual([SATURDAY, SUNDAY, MONDAY]);
  });

  it('spreads an all day event over every day it covers', () => {
    const trip = event('Trip', '2026-11-06T23:00:00.000Z', '2026-11-08T23:00:00.000Z', {
      all_day: true,
    });
    expect([SATURDAY, SUNDAY, MONDAY].map((date) => allDayOn(trip, date, ZONE))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('tints working hours only on working days', () => {
    const hours = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
    expect(workingWindowOn(MONDAY, hours)).toEqual({ from: 540, to: 1020 });
    expect(workingWindowOn(SATURDAY, hours)).toBeNull();
  });
});

describe('alarm pins', () => {
  const now = Date.parse('2026-11-07T12:00:00.000Z');
  const days = [SATURDAY, SUNDAY, MONDAY];

  it('pins a weekday alarm on its days and never on a skipped one', () => {
    const weekly = alarm({ days: [0, 1], skip_on: MONDAY });
    expect(alarmPinsOf([weekly], days, now, ZONE).map((pin) => pin.date)).toEqual([SUNDAY]);
  });

  it('pins a once alarm on its date and a loose alarm on its next ring', () => {
    const once = alarm({ once_on: MONDAY });
    const loose = alarm({ id: 'a1b2c3d4-0000-4000-8000-000000000009', time: '06:30' });
    const pins = alarmPinsOf([once, loose], days, now, ZONE);
    expect(pins.map((pin) => [pin.date, pin.time])).toEqual([
      [SUNDAY, '06:30'],
      [MONDAY, '07:00'],
    ]);
  });

  it('leaves out disabled alarms', () => {
    expect(alarmPinsOf([alarm({ days: [6], enabled: false })], days, now, ZONE)).toEqual([]);
  });
});

describe('now line', () => {
  it('sits in the column of today at the current wall minute', () => {
    const now = Date.parse('2026-11-08T13:20:00.000Z');
    expect(nowPlaceOf([SATURDAY, SUNDAY, MONDAY], now, ZONE)).toEqual({ index: 1, minute: 860 });
    expect(nowPlaceOf([MONDAY], now, ZONE)).toBeNull();
  });
});
