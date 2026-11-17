import {
  PLANNER_ALARM_ROW,
  PLANNER_DAY,
  PLANNER_RING_ROW,
  PLANNER_TIMER_ROW,
  WEATHER_FORECAST,
  type PlannerDay,
  type PlannerOccurrenceView,
  type PlannerRingRow,
  type WeatherForecast,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clockFormatOf } from '../../../format/clock-text';
import {
  briefingLinesOf,
  clockPartsOf,
  greetingOf,
  ringDueOf,
  ringStateOf,
  ringSubjectOf,
  snoozeLabelOf,
  snoozesLeftOf,
  timerDoneLineOf,
  todayRowsOf,
  weatherLineOf,
} from './ring-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const RING = 'a1b2c3d4-0000-4000-8000-000000000002';
const ALARM = 'a1b2c3d4-0000-4000-8000-000000000003';
const TIMER = 'a1b2c3d4-0000-4000-8000-000000000004';
const HOME = 'a1b2c3d4-0000-4000-8000-000000000005';
const CALL = 'a1b2c3d4-0000-4000-8000-000000000006';
const BRUSH = 'a1b2c3d4-0000-4000-8000-000000000007';
const BIRTHDAY = 'a1b2c3d4-0000-4000-8000-000000000008';
const DUE = '2026-11-08T06:00:00.000Z';
const NOW = Date.parse('2026-11-08T06:00:30.000Z');
const STAMP = '2026-11-01T00:00:00.000Z';
const ZONE = 'Europe/Berlin';
const H24 = clockFormatOf(true);
const H12 = clockFormatOf(false);

function ring(overrides: Partial<PlannerRingRow> = {}): PlannerRingRow {
  return PLANNER_RING_ROW.parse({
    id: RING,
    kind: 'alarm',
    ref_id: ALARM,
    profile_id: PROFILE,
    due_at: DUE,
    rang_at: DUE,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'rang',
    missed_reason: null,
    ...overrides,
  });
}

const ALARM_ROW = PLANNER_ALARM_ROW.parse({
  id: ALARM,
  profile_id: PROFILE,
  label: 'Wake up',
  time: '07:00',
  days: [1, 2, 3, 4, 5],
  once_on: null,
  skip_on: null,
  enabled: true,
  sound: { kind: 'tone', id: 'dawn' },
  ramp_seconds: 30,
  vibrate: true,
  snooze_minutes: 9,
  snooze_limit: 3,
  challenge: { kind: 'maths', difficulty: 'easy', count: 2 },
  sunrise: null,
  smart_minutes: null,
  wake_automation_id: null,
  wake_lead_minutes: null,
  targets: [],
  watch: [],
  source: 'planner',
  created_at: STAMP,
  updated_at: STAMP,
});

const TIMER_ROW = PLANNER_TIMER_ROW.parse({
  id: TIMER,
  profile_id: PROFILE,
  label: 'Pasta',
  duration_ms: 600_000,
  state: 'done',
  ends_at: null,
  remaining_ms: null,
  targets: [],
  created_at: STAMP,
  updated_at: STAMP,
});

function view(
  itemId: string,
  title: string,
  start: string | null,
  extra: Partial<PlannerOccurrenceView> = {},
): PlannerOccurrenceView {
  return {
    item_id: itemId,
    occurrence_key: 'single',
    collection_id: HOME,
    kind: 'event',
    title,
    location: null,
    priority: null,
    all_day: false,
    start,
    end: null,
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

function dayOf(overrides: Partial<PlannerDay> = {}): PlannerDay {
  return PLANNER_DAY.parse({
    date: '2026-11-08',
    time_zone: ZONE,
    now: '2026-11-08T06:00:30.000Z',
    missed: [],
    current: [],
    upcoming: [
      view(CALL, 'Call parents', '2026-11-08T10:00:00.000Z'),
      view(BRUSH, 'Brush teeth', null, { kind: 'task', due_at: '2026-11-08T06:30:00.000Z' }),
      view(BIRTHDAY, 'Ana’s birthday', null, { all_day: true }),
    ],
    done: [],
    happened: [],
    rings: [ring()],
    next_alarm_at: null,
    strip: [],
    ...overrides,
  });
}

describe('ring lookup', () => {
  it('takes the due moment from the incoming notice before the day', () => {
    const notice = {
      type: 'planner_ring',
      ringId: RING,
      kind: 'alarm',
      refId: ALARM,
      dueAt: '2026-11-07T22:00:00.000Z',
    } as const;
    expect(ringDueOf(RING, notice, undefined)).toBe('2026-11-07T22:00:00.000Z');
    expect(ringDueOf(RING, null, dayOf().rings)).toBe(DUE);
    expect(ringDueOf(RING, null, undefined)).toBeUndefined();
    expect(ringDueOf(RING, null, [])).toBeNull();
  });

  it('names each state of the ring screen', () => {
    const base = { ringId: RING, due: DUE, failed: false, now: NOW, local: null };
    expect(ringStateOf({ ...base, rows: [ring()] }).kind).toBe('ringing');
    expect(ringStateOf({ ...base, rows: undefined }).kind).toBe('loading');
    expect(ringStateOf({ ...base, due: null, rows: [] }).kind).toBe('missing');
    expect(ringStateOf({ ...base, rows: [] }).kind).toBe('missing');
    expect(ringStateOf({ ...base, ringId: null, due: null, rows: [] }).kind).toBe('missing');
    expect(ringStateOf({ ...base, ringId: undefined, due: undefined, rows: [] }).kind).toBe(
      'loading',
    );
    expect(ringStateOf({ ...base, failed: true, rows: undefined }).kind).toBe('unreachable');
    expect(ringStateOf({ ...base, rows: [ring({ dismissed_at: DUE })] }).kind).toBe('stopped');
    expect(
      ringStateOf({
        ...base,
        rows: [
          ring({
            rang_at: null,
            outcome: 'missed',
            missed_reason: 'phone_off',
            dismissed_at: null,
          }),
        ],
      }).kind,
    ).toBe('stopped');
    expect(
      ringStateOf({ ...base, rows: [ring({ rang_at: '2026-11-08T06:09:00.000Z', snoozes: 1 })] }),
    ).toEqual({
      kind: 'snoozed',
      ring: ring({ rang_at: '2026-11-08T06:09:00.000Z', snoozes: 1 }),
      until: '2026-11-08T06:09:00.000Z',
    });
  });
});

describe('phone ringing on its own', () => {
  const local = { key: `alarm:${ALARM}`, kind: 'alarm', refId: ALARM } as const;
  const base = { ringId: RING, due: DUE, now: NOW, local };

  it('shows the phone ring when the hub cannot find it, cannot be reached or calls it stopped', () => {
    expect(ringStateOf({ ...base, failed: true, rows: undefined })).toEqual({
      kind: 'local',
      local,
    });
    expect(ringStateOf({ ...base, failed: false, rows: [] }).kind).toBe('local');
    expect(ringStateOf({ ...base, failed: false, rows: undefined }).kind).toBe('local');
    expect(ringStateOf({ ...base, failed: false, rows: [ring({ dismissed_at: DUE })] }).kind).toBe(
      'local',
    );
  });

  it('keeps the hub ring while the hub has it ringing or snoozed', () => {
    expect(ringStateOf({ ...base, failed: false, rows: [ring()] }).kind).toBe('ringing');
  });
});

describe('ring subject', () => {
  const refs = { alarms: [ALARM_ROW], timers: [TIMER_ROW], items: [] };

  it('snoozes an alarm by its own minutes and adds a minute to a timer', () => {
    const alarm = ringSubjectOf(ring(), refs);
    expect(alarm).toEqual({
      label: 'Wake up',
      icon: 'alarmClock',
      snooze: { kind: 'alarm', minutes: 9 },
      limit: 3,
      challenge: { kind: 'maths', difficulty: 'easy', count: 2 },
      sound: { kind: 'tone', id: 'dawn' },
    });
    expect(alarm.snooze === null ? null : snoozeLabelOf(alarm.snooze, null)).toBe('Snooze 9 min');
    expect(alarm.snooze === null ? null : snoozeLabelOf(alarm.snooze, 2)).toBe(
      'Snooze 9 min · 2 left',
    );
    const timer = ringSubjectOf({ kind: 'timer', ref_id: TIMER }, refs);
    expect(timer.label).toBe('Pasta');
    expect(timer.challenge).toEqual({ kind: 'none' });
    expect(timer.snooze === null ? null : snoozeLabelOf(timer.snooze, null)).toBe('Add 1 min');
  });

  it('offers no snooze when the alarm is gone', () => {
    expect(ringSubjectOf(ring(), { alarms: [], timers: [], items: [] })).toEqual({
      label: 'Alarm',
      icon: 'alarmClock',
      snooze: null,
      limit: null,
      challenge: { kind: 'none' },
      sound: null,
    });
  });
});

describe('snoozes left', () => {
  it('counts down from the limit with the snoozes the hub saw', () => {
    expect(snoozesLeftOf(null, 4, null)).toBeNull();
    expect(snoozesLeftOf(3, 1, null)).toBe(2);
    expect(snoozesLeftOf(3, 5, null)).toBe(0);
  });

  it('trusts the phone count while the phone is ringing it', () => {
    expect(snoozesLeftOf(3, 0, { ringing: true, snoozesLeft: 1 })).toBe(1);
    expect(snoozesLeftOf(3, 0, { ringing: false, snoozesLeft: 1 })).toBe(3);
  });
});

describe('ring clock', () => {
  it('splits the day period off so the digits can be drawn large', () => {
    expect(clockPartsOf('07:05')).toEqual({ digits: '07:05', period: null });
    expect(clockPartsOf('7:05\u202fAM')).toEqual({ digits: '7:05', period: 'AM' });
  });
});

describe('good morning card', () => {
  it('greets by the hour', () => {
    expect(greetingOf(6)).toBe('Good morning');
    expect(greetingOf(13)).toBe('Good afternoon');
    expect(greetingOf(21)).toBe('Good evening');
  });

  it('leaves what is booked to the today list and names what was missed', () => {
    const day = dayOf({ missed: [view(HOME, 'Water plants', '2026-11-07T15:00:00.000Z')] });
    expect(briefingLinesOf(day)).toEqual(['1 missed earlier.']);
    expect(briefingLinesOf(dayOf())).toEqual([]);
  });

  it('says when nothing else is booked', () => {
    expect(briefingLinesOf(dayOf({ upcoming: [] }))).toEqual(['Nothing else is booked today.']);
  });
});

describe('finished timer line', () => {
  it('names the length and how long ago it finished', () => {
    const rang = ring({ kind: 'timer', ref_id: TIMER, rang_at: '2026-11-08T05:58:00.000Z' });
    expect(timerDoneLineOf(TIMER_ROW, rang, NOW)).toBe('10 min timer · finished 2 min ago');
    expect(timerDoneLineOf(undefined, rang, NOW)).toBe('Finished 2 min ago');
    expect(timerDoneLineOf(TIMER_ROW, null, NOW)).toBe('10 min timer');
    expect(timerDoneLineOf(undefined, null, NOW)).toBeNull();
  });
});

describe('today list', () => {
  it('puts all-day items first, then the rest by time, with list colours', () => {
    const rows = todayRowsOf(dayOf(), new Map([[HOME, 'home']]), H12.instant);
    expect(rows.map((row) => [row.time, row.title, row.colour])).toEqual([
      ['All day', 'Ana’s birthday', 'home'],
      [H12.instant('2026-11-08T06:30:00.000Z', ZONE), 'Brush teeth', 'home'],
      [H12.instant('2026-11-08T10:00:00.000Z', ZONE), 'Call parents', 'home'],
    ]);
  });
});

describe('weather line', () => {
  const forecast: WeatherForecast = WEATHER_FORECAST.parse({
    latitude: 52.5,
    longitude: 13.4,
    timeZone: ZONE,
    now: {
      at: '2026-11-08T06:00:00.000Z',
      temperatureC: 9,
      feelsLikeC: 7,
      humidityPercent: 80,
      dewPointC: null,
      precipitationMm: 0,
      code: 0,
      isDay: false,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 5,
      windDirection: null,
      gustKmh: null,
      uvIndex: null,
      visibilityM: null,
    },
    hourly: [],
    air: null,
    daily: [
      {
        day: '2026-11-08',
        code: 0,
        nightCode: 0,
        minC: 3,
        maxC: 11,
        sunrise: '2026-11-08T06:14:00.000Z',
        sunset: '2026-11-08T15:30:00.000Z',
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 10,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
  });

  it('reads the temperature, the sky and the sunrise of today', () => {
    expect(weatherLineOf(forecast, '2026-11-08', H24.instant)).toBe(
      `9° clear · sunrise ${H24.instant('2026-11-08T06:14:00.000Z', ZONE)}`,
    );
    expect(weatherLineOf(forecast, '2026-11-08', H12.instant)).toMatch(/sunrise 7:14\s\S+$/u);
    expect(weatherLineOf(forecast, '2026-11-09', H24.instant)).toBe('9° clear');
  });
});
