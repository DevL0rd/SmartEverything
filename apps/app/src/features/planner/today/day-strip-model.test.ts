import {
  PLANNER_COLLECTION_ROW,
  PLANNER_DAY,
  PLANNER_STATS,
  PLANNER_TIMER_ROW,
  type PlannerCollectionRow,
  type WeatherHour,
  type PlannerDay,
  type PlannerOccurrenceView,
  type PlannerStripSegment,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { percent } from '../../../format/number';
import {
  STRIP_COLOURS,
  bookedMinutesOf,
  dayStripOf,
  focusGoalMinutesOf,
  liveTimersOf,
  nowIn,
  onTimeOf,
  planPromptOf,
  rainBarsOf,
  sunOf,
  timerLeftMs,
  todayRingsOf,
} from './day-strip-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const WORK = 'a1b2c3d4-0000-4000-8000-000000000002';
const HOME = 'a1b2c3d4-0000-4000-8000-000000000003';
const GONE = 'a1b2c3d4-0000-4000-8000-000000000004';
const BRUSH = 'a1b2c3d4-0000-4000-8000-000000000005';
const WATER = 'a1b2c3d4-0000-4000-8000-000000000006';
const BILL = 'a1b2c3d4-0000-4000-8000-000000000007';
const TIMER = 'a1b2c3d4-0000-4000-8000-000000000008';
const BERLIN = { latitude: 52.52, longitude: 13.405 };
const ZONE = 'Europe/Berlin';
const STAMP = '2026-11-01T00:00:00.000Z';
const NOW = Date.parse('2026-11-07T13:20:00.000Z');

function collection(id: string, colour: PlannerCollectionRow['colour']): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id,
    profile_id: PROFILE,
    kind: 'calendar',
    name: colour,
    colour,
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

const COLLECTIONS = [collection(WORK, 'work'), collection(HOME, 'home')];

function view(
  itemId: string,
  status: PlannerOccurrenceView['status'],
  start: string | null,
  kind: PlannerOccurrenceView['kind'] = 'task',
): PlannerOccurrenceView {
  return {
    item_id: itemId,
    occurrence_key: 'single',
    collection_id: HOME,
    kind,
    title: 'Something',
    location: null,
    priority: null,
    all_day: false,
    start,
    end: null,
    due_at: null,
    due_date: null,
    status,
    recurring: false,
    moved: false,
    completed_at: status === 'done' ? STAMP : null,
    completed_by: status === 'done' ? 'person' : null,
    evidence: null,
    attachments: [],
    google_state: null,
  };
}

function segment(
  kind: PlannerStripSegment['kind'],
  from: string,
  to: string,
  extra: Partial<PlannerStripSegment> = {},
): PlannerStripSegment {
  return {
    kind,
    from,
    to,
    label: null,
    collection_id: null,
    item_id: null,
    item_kind: null,
    ...extra,
  };
}

function dayOf(overrides: Partial<PlannerDay> = {}): PlannerDay {
  return PLANNER_DAY.parse({
    date: '2026-11-07',
    time_zone: ZONE,
    now: '2026-11-07T13:20:00.000Z',
    missed: [view(WATER, 'missed', '2026-11-07T11:00:00.000Z')],
    current: [],
    upcoming: [view(BILL, 'open', null), view(GONE, 'open', null, 'event')],
    done: [view(BRUSH, 'done', '2026-11-07T06:40:00.000Z')],
    happened: [],
    rings: [],
    next_alarm_at: '2026-11-08T06:00:00.000Z',
    strip: [
      segment('sleep', '2026-11-06T22:10:00.000Z', '2026-11-07T05:15:00.000Z'),
      segment('event', '2026-11-07T08:00:00.000Z', '2026-11-07T10:00:00.000Z', {
        collection_id: WORK,
      }),
      segment('event', '2026-11-07T09:30:00.000Z', '2026-11-07T11:00:00.000Z', {
        collection_id: GONE,
      }),
      segment('alarm', '2026-11-07T06:00:00.000Z', '2026-11-07T06:00:00.000Z'),
      segment('task', '2026-11-07T06:40:00.000Z', '2026-11-07T06:40:00.000Z', {
        item_id: BRUSH,
      }),
      segment('task', '2026-11-07T11:00:00.000Z', '2026-11-07T11:00:00.000Z', {
        item_id: WATER,
      }),
      segment('task', '2026-11-07T20:00:00.000Z', '2026-11-07T20:00:00.000Z', {
        item_id: BILL,
      }),
      segment('free', '2026-11-07T14:00:00.000Z', '2026-11-07T15:30:00.000Z'),
      segment('free', '2026-11-07T16:00:00.000Z', '2026-11-07T18:00:00.000Z'),
    ],
    ...overrides,
  });
}

describe('day strip model', () => {
  const strip = dayStripOf({
    day: dayOf(),
    collections: COLLECTIONS,
    place: BERLIN,
    showSleep: true,
  });

  it('spans the local day of the planner time zone', () => {
    expect(new Date(strip.from).toISOString()).toBe('2026-11-06T23:00:00.000Z');
    expect(new Date(strip.to).toISOString()).toBe('2026-11-07T23:00:00.000Z');
    expect(strip.hours.map((hour) => hour.label)).toEqual(['00', '06', '12', '18', '24']);
    expect(new Date(strip.hours[1]?.at ?? 0).toISOString()).toBe('2026-11-07T05:00:00.000Z');
  });

  it('paints daylight first, then sleep clipped to the day, then events in calendar colours', () => {
    expect(strip.segments.map((block) => block.state)).toEqual([
      'daylight',
      'sleep',
      'work',
      'event',
    ]);
    expect(strip.segments[1]?.start).toBe(strip.from);
    expect(strip.sleepMinutes).toBe(375);
    expect(STRIP_COLOURS.work).toBe('viz-6');
    expect(STRIP_COLOURS.event).toBe('on-surface-variant');
  });

  it('marks alarms as pins and tasks as dots in their done, missed or open tone', () => {
    expect(strip.alarms).toEqual([Date.parse('2026-11-07T06:00:00.000Z')]);
    expect(strip.marks.map((mark) => mark.tone)).toEqual(['done', 'missed', 'open']);
    expect(strip.label).toContain('2 events, 1 alarm, 3 tasks, 1 missed, slept 6h 15m');
  });

  it('leaves sleep out when the person turned it off and daylight out without a home place', () => {
    const plain = dayStripOf({
      day: dayOf(),
      collections: COLLECTIONS,
      place: null,
      showSleep: false,
    });
    expect(plain.segments.map((block) => block.state)).toEqual(['work', 'event']);
    expect(plain.sleepMinutes).toBe(0);
    expect(plain.sun).toBeNull();
  });

  it('places the hour labels on the wall clock across a DST change', () => {
    const autumn = dayStripOf({
      day: dayOf({ date: '2026-10-25', strip: [] }),
      collections: [],
      place: null,
      showSleep: true,
    });
    expect((autumn.to - autumn.from) / 3_600_000).toBe(25);
    expect(new Date(autumn.hours[1]?.at ?? 0).toISOString()).toBe('2026-10-25T05:00:00.000Z');
    expect(autumn.segments).toEqual([]);
  });

  it('shows the now marker only inside the day', () => {
    expect(nowIn(strip, NOW)).toBe(NOW);
    expect(nowIn(strip, strip.to + 1)).toBeNull();
  });

  it('finds sunrise before sunset in Berlin and no daylight band in the polar night', () => {
    const sun = sunOf('2026-11-07', BERLIN);
    expect(sun).not.toBeNull();
    expect((sun?.rise ?? 0) < (sun?.set ?? 0)).toBe(true);
    expect(sunOf('2026-12-21', { latitude: 89, longitude: 0 })).toBeNull();
  });
});

describe('today rings', () => {
  const hours = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } as const;

  it('counts booked event time once where events overlap', () => {
    expect(bookedMinutesOf(dayOf())).toBe(180);
  });

  it('uses the working hours of a working day as the focus goal', () => {
    expect(focusGoalMinutesOf('2026-11-06', hours)).toBe(480);
    expect(focusGoalMinutesOf('2026-11-07', hours)).toBeNull();
    expect(focusGoalMinutesOf('2026-11-06', null)).toBeNull();
  });

  it('reads tasks done of planned, focus hours and move progress', () => {
    const friday = todayRingsOf({
      day: dayOf({ date: '2026-11-06', strip: dayOf().strip }),
      workingHours: hours,
      move: 0.62,
    });
    expect(friday.map((ring) => ring.value)).toEqual(['1 / 3', '0 / 8 h', percent(0.62)]);
    const saturday = todayRingsOf({ day: dayOf(), workingHours: hours, move: null });
    expect(saturday.map((ring) => ring.value)).toEqual(['1 / 3', '3 h', 'No data']);
    expect(saturday[0]?.progress).toBeCloseTo(1 / 3);
    expect(saturday.map((ring) => ring.colour)).toEqual(['primary', 'viz-1', 'viz-4']);
  });

  it('gives the short phone wording and never caps move beyond its goal', () => {
    const rings = todayRingsOf({
      day: dayOf({ date: '2026-11-06', strip: dayOf().strip }),
      workingHours: hours,
      move: 12.5,
    });
    expect(rings.map((ring) => ring.brief)).toEqual(['1 of 3', '0 h', percent(12.5)]);
    expect(rings[2]?.progress).toBe(12.5);
  });
});

describe('on time bars', () => {
  const stats = PLANNER_STATS.parse({
    range: 'week',
    from: '2026-11-01',
    to: '2026-11-07',
    completion: { done: 6, due: 8 },
    on_time: { on_time: 3, late: 1 },
    streaks: { current: 2, longest: 4 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: [],
    device_share: { by_device: 1, by_hand: 5 },
    list_trends: [
      { collection_id: WORK, points: [{ day: '2026-11-02', done: 1, due: 2 }] },
      {
        collection_id: HOME,
        points: [
          { day: '2026-11-02', done: 1, due: 2 },
          { day: '2026-11-07', done: 2, due: 2 },
        ],
      },
    ],
    timer_use: [],
    alarms: [],
  });

  it('gives one bar per day of the range with the share done and today highlighted', () => {
    const model = onTimeOf(stats);
    expect(model.bars.map((bar) => bar.label)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(model.bars.map((bar) => bar.value)).toEqual([0, 0.5, 0, 0, 0, 0, 1]);
    expect(model.today).toBe('2026-11-07');
    expect(model.label).toBe(`On time ${percent(0.75)}`);
  });
});

describe('side column helpers', () => {
  const timer = (state: 'running' | 'paused' | 'done'): PlannerTimerRow =>
    PLANNER_TIMER_ROW.parse({
      id: TIMER,
      profile_id: PROFILE,
      label: 'Pasta',
      duration_ms: 600_000,
      state,
      ends_at: state === 'running' ? '2026-11-07T13:24:12.000Z' : null,
      remaining_ms: state === 'paused' ? 252_000 : null,
      targets: [],
      created_at: STAMP,
      updated_at: STAMP,
    });

  it('reads the time left of running and paused timers', () => {
    expect(timerLeftMs(timer('running'), NOW)).toBe(252_000);
    expect(timerLeftMs(timer('paused'), NOW)).toBe(252_000);
    expect(liveTimersOf([timer('running'), timer('done')])).toHaveLength(1);
  });

  it('offers a plan only when unscheduled tasks and free slots remain', () => {
    expect(planPromptOf(dayOf(), NOW)).toEqual({
      tasks: 1,
      slots: 2,
      until: Date.parse('2026-11-07T18:00:00.000Z'),
    });
    expect(planPromptOf(dayOf(), Date.parse('2026-11-07T19:00:00.000Z'))).toBeNull();
  });

  const hour = (at: string, precipitationMm: number): WeatherHour => ({
    at,
    temperatureC: 12,
    feelsLikeC: 10,
    humidityPercent: 80,
    precipitationChance: null,
    precipitationMm,
    code: precipitationMm > 0 ? 61 : 3,
    windKmh: 10,
    uvIndex: null,
    isDay: true,
  });

  it('charts rain from the current hour to the end of the day, and nothing on a dry day', () => {
    const end = Date.parse('2026-11-07T23:00:00.000Z');
    const hours = [
      hour('2026-11-07T12:00:00.000Z', 0.4),
      hour('2026-11-07T13:00:00.000Z', 0),
      hour('2026-11-07T16:00:00.000Z', 1.2),
      hour('2026-11-07T23:00:00.000Z', 3),
    ];
    expect(rainBarsOf(hours, NOW, end)).toEqual([
      { key: '2026-11-07T13:00:00.000Z', value: 0 },
      { key: '2026-11-07T16:00:00.000Z', value: 1.2 },
    ]);
    expect(rainBarsOf([hour('2026-11-07T16:00:00.000Z', 0)], NOW, end)).toEqual([]);
  });
});
