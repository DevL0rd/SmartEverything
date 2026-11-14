import { describe, expect, it } from 'vitest';
import { SIGNAL_INPUT } from '../src/signals';
import { PLANNER_DAY } from '../src/planner/day';
import { PLANNER_OCCURRENCE_VIEW, PLANNER_RANGE } from '../src/planner/range';
import {
  PLANNER_PHONE_RINGS_NOTICE,
  PLANNER_RING_NOTICE,
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_KINDS,
} from '../src/planner/signals';
import { PLANNER_STATS } from '../src/planner/stats';
import { PLANNER_SUMMARY_NOTICE } from '../src/planner/summary';

const ITEM = '5d7b1d8e-6a43-4c1c-8d1f-2a9b3c4d5e6f';
const COLLECTION = '0b1c6a54-2f0e-4b6e-9a43-0f3b6d2b7a10';
const ALARM = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const RING = '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9';

const view = {
  item_id: ITEM,
  occurrence_key: 'single',
  collection_id: COLLECTION,
  kind: 'task',
  title: 'Brush teeth',
  location: null,
  priority: null,
  all_day: false,
  start: null,
  end: null,
  due_at: '2026-11-07T21:00:00+00:00',
  due_date: null,
  status: 'open',
  recurring: false,
  moved: false,
  completed_at: null,
  completed_by: null,
  evidence: null,
  attachments: [],
  google_state: null,
};

const day = {
  date: '2026-11-07',
  time_zone: 'Europe/Berlin',
  now: '2026-11-07T10:00:00+00:00',
  missed: [view],
  current: [],
  upcoming: [],
  done: [],
  happened: [
    { at: '2026-11-07T07:00:00+00:00', source: 'toothbrush', deviceId: null, summary: 'Brushed' },
  ],
  rings: [],
  next_alarm_at: null,
  strip: [
    {
      kind: 'free',
      from: '2026-11-07T09:00:00+00:00',
      to: '2026-11-07T10:00:00+00:00',
      label: null,
      collection_id: null,
      item_id: null,
      item_kind: null,
    },
  ],
};

const stats = {
  range: 'week',
  from: '2026-11-01',
  to: '2026-11-07',
  completion: { done: 3, due: 4 },
  on_time: { on_time: 2, late: 1 },
  streaks: { current: 2, longest: 5 },
  best_hours: [{ hour: 8, done: 2 }],
  time_by_calendar: [{ collection_id: COLLECTION, minutes: 90 }],
  weekly_load: [{ day: '2026-11-07', scheduled_minutes: 120, items: 3 }],
  device_share: { by_device: 1, by_hand: 2 },
  list_trends: [{ collection_id: COLLECTION, points: [{ day: '2026-11-07', done: 1, due: 2 }] }],
  timer_use: [{ day: '2026-11-07', label: 'Tea', count: 2, total_ms: 360000 }],
  alarms: [
    { alarm_id: ALARM, rang: 5, missed: 1, snoozes: 2, average_minute: 420, spread_minutes: 6 },
  ],
};

const task = { itemId: ITEM, occurrenceKey: 'single', title: 'Brush teeth', dueAt: null };
const alarm = { alarmId: ALARM, ringId: RING, label: null, dueAt: '2026-11-07T06:30:00+00:00' };

const signalData: Record<string, unknown> = {
  task_due: task,
  task_missed: task,
  task_done: { ...task, completedBy: 'signal' },
  alarm_rang: alarm,
  alarm_dismissed: alarm,
  alarm_snoozed: { ...alarm, snoozes: 1, until: '2026-11-07T06:39:00+00:00' },
  timer_done: { timerId: ALARM, label: null, durationMs: 60000 },
  event_starting: {
    itemId: ITEM,
    occurrenceKey: '2026-11-07T09:00:00+00:00',
    title: 'Dentist',
    startsAt: '2026-11-07T09:00:00+00:00',
    minutesBefore: 10,
  },
};

function signal(kind: string): Record<string, unknown> {
  return {
    source: 'planner',
    kind,
    subject: ITEM,
    field: null,
    value: true,
    previous: null,
    at: '2026-11-07T10:00:00+00:00',
    profileId: COLLECTION,
    data: signalData[kind],
  };
}

describe('planner occurrence views and ranges', () => {
  it('accepts an open task and rejects evidence on one that is not done', () => {
    expect(PLANNER_OCCURRENCE_VIEW.safeParse(view).success).toBe(true);
    const evidence = { source: 'x', deviceId: null, summary: 'y', sessionId: null };
    expect(PLANNER_OCCURRENCE_VIEW.safeParse({ ...view, evidence }).success).toBe(false);
    expect(
      PLANNER_OCCURRENCE_VIEW.safeParse({
        ...view,
        status: 'done',
        evidence,
        completed_at: '2026-11-07T10:00:00+00:00',
        completed_by: 'signal',
      }).success,
    ).toBe(true);
  });

  it('rejects an end without a start and an unknown field', () => {
    expect(
      PLANNER_OCCURRENCE_VIEW.safeParse({ ...view, end: '2026-11-07T10:00:00+00:00' }).success,
    ).toBe(false);
    expect(PLANNER_OCCURRENCE_VIEW.safeParse({ ...view, extra: 1 }).success).toBe(false);
  });

  it('rejects a range that ends before it starts', () => {
    const range = {
      from: '2026-11-07T00:00:00+00:00',
      to: '2026-11-08T00:00:00+00:00',
      occurrences: [view],
    };
    expect(PLANNER_RANGE.safeParse(range).success).toBe(true);
    expect(PLANNER_RANGE.safeParse({ ...range, to: '2026-11-06T00:00:00+00:00' }).success).toBe(
      false,
    );
  });
});

describe('planner day and stats', () => {
  it('accepts a composed day and rejects an inverted strip segment', () => {
    expect(PLANNER_DAY.safeParse(day).success).toBe(true);
    const segment = { ...day.strip[0], from: '2026-11-07T11:00:00+00:00' };
    expect(PLANNER_DAY.safeParse({ ...day, strip: [segment] }).success).toBe(false);
  });

  it('accepts stats for the three ranges and rejects more done than due', () => {
    for (const range of ['week', 'month', 'year']) {
      expect(PLANNER_STATS.safeParse({ ...stats, range }).success).toBe(true);
    }
    expect(PLANNER_STATS.safeParse({ ...stats, range: 'decade' }).success).toBe(false);
    expect(PLANNER_STATS.safeParse({ ...stats, completion: { done: 5, due: 4 } }).success).toBe(
      false,
    );
    expect(PLANNER_STATS.safeParse({ ...stats, from: '2026-11-08' }).success).toBe(false);
  });
});

describe('planner signals and notices', () => {
  it('has a payload for every signal kind and each also reads as a bus signal', () => {
    for (const kind of PLANNER_SIGNAL_KINDS) {
      expect(PLANNER_SIGNAL.safeParse(signal(kind)).success, kind).toBe(true);
      expect(SIGNAL_INPUT.safeParse(signal(kind)).success, kind).toBe(true);
    }
  });

  it('rejects a payload that belongs to another kind and a foreign source', () => {
    expect(PLANNER_SIGNAL.safeParse({ ...signal('timer_done'), data: task }).success).toBe(false);
    expect(PLANNER_SIGNAL.safeParse({ ...signal('task_due'), source: 'health' }).success).toBe(
      false,
    );
    expect(PLANNER_SIGNAL.safeParse({ ...signal('task_done'), data: task }).success).toBe(false);
  });

  it('reads the phone ring set notice and nothing else', () => {
    expect(PLANNER_PHONE_RINGS_NOTICE.safeParse({ type: 'planner_phone_rings' }).success).toBe(
      true,
    );
    expect(
      PLANNER_PHONE_RINGS_NOTICE.safeParse({ type: 'planner_phone_rings', clientId: ITEM }).success,
    ).toBe(false);
    expect(PLANNER_PHONE_RINGS_NOTICE.safeParse({ type: 'planner_ring' }).success).toBe(false);
  });

  it('reads the ring and summary notices', () => {
    expect(
      PLANNER_RING_NOTICE.safeParse({
        type: 'planner_ring',
        ringId: RING,
        kind: 'alarm',
        refId: ALARM,
        dueAt: '2026-11-07T06:30:00+00:00',
      }).success,
    ).toBe(true);
    const summary = {
      type: 'planner_summary',
      personId: COLLECTION,
      missed: 2,
      left: 5,
      nextAlarmAt: null,
      runningTimers: 1,
    };
    expect(PLANNER_SUMMARY_NOTICE.safeParse(summary).success).toBe(true);
    expect(PLANNER_SUMMARY_NOTICE.safeParse({ ...summary, missed: -1 }).success).toBe(false);
  });
});
