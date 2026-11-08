import { describe, expect, it } from 'vitest';
import { PLANNER_ALARM_ROW } from '../src/planner/alarms';
import { PLANNER_ATTACHMENT } from '../src/planner/attachments';
import { PLANNER_COLLECTION_ROW } from '../src/planner/collections';
import { PLANNER_COMPLETION } from '../src/planner/completion';
import { PLANNER_ITEM_ROW, parsePlannerRrule } from '../src/planner/items';
import { PLANNER_OCCURRENCE_ROW } from '../src/planner/occurrences';
import { PLANNER_PREFERENCES } from '../src/planner/preferences';
import { PLANNER_RING_ROW } from '../src/planner/rings';
import { PLANNER_STOPWATCH_ROW } from '../src/planner/stopwatch';
import { PLANNER_TIMER_ROW } from '../src/planner/timers';

const ID = '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f';
const OTHER = '7d1e9a2c-8b3f-4c5d-a6e7-0f1a2b3c4d5e';
const NOW = '2026-11-07T08:00:00Z';

const collection = {
  id: ID,
  profile_id: OTHER,
  kind: 'calendar',
  name: 'Work',
  colour: 'work',
  icon: 'briefcase',
  position: 1,
  visible: true,
  default_reminders: [{ minutes_before: 10 }],
  source: 'local',
  google: null,
  created_at: NOW,
  updated_at: NOW,
};

const timedItem = {
  id: ID,
  profile_id: OTHER,
  collection_id: OTHER,
  kind: 'event',
  parent_id: null,
  title: 'Dentist',
  notes: '',
  location: null,
  priority: null,
  tags: [],
  estimate_minutes: null,
  start_local: '2026-11-09T14:00',
  end_local: '2026-11-09T15:00',
  time_zone: 'Asia/Bangkok',
  all_day: false,
  due_date: null,
  due_at: null,
  rrule: null,
  exdates: [],
  series_id: null,
  original_start: null,
  start: '2026-11-09T07:00:00Z',
  end: '2026-11-09T08:00:00Z',
  series_end: null,
  status: 'open',
  position: 0,
  completion: { kind: 'manual' },
  attachments: [],
  reminders: [],
  google: null,
  created_by: 'person',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
};

const allDayItem = {
  ...timedItem,
  title: 'Holiday',
  start_local: '2026-12-25',
  end_local: '2026-12-25',
  time_zone: null,
  all_day: true,
};

const weekly = { ...timedItem, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', series_end: null };

describe('planner item rows', () => {
  it('keeps the wall time and zone of a timed item', () => {
    const parsed = PLANNER_ITEM_ROW.parse(timedItem);
    expect(parsed.start_local).toBe('2026-11-09T14:00');
    expect(parsed.time_zone).toBe('Asia/Bangkok');
  });

  it('keeps the date of an all-day item without a zone', () => {
    const parsed = PLANNER_ITEM_ROW.parse(allDayItem);
    expect(parsed.start_local).toBe('2026-12-25');
    expect(parsed.time_zone).toBeNull();
  });

  it('rejects an all-day item with a zone or a time', () => {
    expect(PLANNER_ITEM_ROW.safeParse({ ...allDayItem, time_zone: 'Asia/Bangkok' }).success).toBe(
      false,
    );
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...allDayItem, start_local: '2026-12-25T09:00' }).success,
    ).toBe(false);
  });

  it('rejects a timed item without a zone and an end before the start', () => {
    expect(PLANNER_ITEM_ROW.safeParse({ ...timedItem, time_zone: null }).success).toBe(false);
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...timedItem, end_local: '2026-11-09T13:00' }).success,
    ).toBe(false);
  });

  it('rejects an EXDATE whose type differs from the start', () => {
    expect(PLANNER_ITEM_ROW.safeParse({ ...weekly, exdates: ['2026-11-16'] }).success).toBe(false);
    expect(PLANNER_ITEM_ROW.safeParse({ ...weekly, exdates: ['2026-11-16T14:00'] }).success).toBe(
      true,
    );
    const yearly = { ...allDayItem, rrule: 'FREQ=YEARLY' };
    expect(PLANNER_ITEM_ROW.safeParse({ ...yearly, exdates: ['2027-12-25T00:00'] }).success).toBe(
      false,
    );
    expect(PLANNER_ITEM_ROW.safeParse({ ...yearly, exdates: ['2027-12-25'] }).success).toBe(true);
  });

  it('rejects an UNTIL whose type differs from the start', () => {
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...weekly, rrule: 'FREQ=WEEKLY;UNTIL=20261231' }).success,
    ).toBe(false);
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...weekly, rrule: 'FREQ=WEEKLY;UNTIL=20261231T140000Z' })
        .success,
    ).toBe(true);
    const yearly = { ...allDayItem, rrule: 'FREQ=YEARLY;UNTIL=20301225T000000' };
    expect(PLANNER_ITEM_ROW.safeParse(yearly).success).toBe(false);
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...yearly, rrule: 'FREQ=YEARLY;UNTIL=20301225' }).success,
    ).toBe(true);
  });

  it('needs a repeat rule for exdates and a series end', () => {
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...timedItem, exdates: ['2026-11-16T14:00'] }).success,
    ).toBe(false);
    expect(PLANNER_ITEM_ROW.safeParse({ ...timedItem, series_end: NOW }).success).toBe(false);
  });

  it('ties a changed occurrence to its series', () => {
    const override = { ...timedItem, series_id: OTHER, original_start: '2026-11-16T14:00' };
    expect(PLANNER_ITEM_ROW.safeParse(override).success).toBe(true);
    expect(PLANNER_ITEM_ROW.safeParse({ ...override, original_start: null }).success).toBe(false);
    expect(PLANNER_ITEM_ROW.safeParse({ ...override, original_start: '2026-11-16' }).success).toBe(
      false,
    );
    expect(PLANNER_ITEM_ROW.safeParse({ ...override, rrule: 'FREQ=DAILY' }).success).toBe(false);
  });

  it('gives an event a start and a task an optional one', () => {
    const open = {
      ...timedItem,
      start_local: null,
      end_local: null,
      time_zone: null,
      start: null,
      end: null,
    };
    expect(PLANNER_ITEM_ROW.safeParse(open).success).toBe(false);
    const task = { ...open, kind: 'task', due_date: '2026-11-10' };
    expect(PLANNER_ITEM_ROW.safeParse(task).success).toBe(true);
    expect(PLANNER_ITEM_ROW.safeParse({ ...timedItem, due_date: '2026-11-10' }).success).toBe(
      false,
    );
  });

  it('rejects unknown fields and carries a Google link', () => {
    expect(PLANNER_ITEM_ROW.safeParse({ ...timedItem, extra: 1 }).success).toBe(false);
    const google = {
      id: 'abc',
      calendarOrListId: 'primary',
      etag: '"1"',
      base: { title: 'Dentist' },
      state: 'synced',
    };
    expect(PLANNER_ITEM_ROW.safeParse({ ...timedItem, google }).success).toBe(true);
    expect(
      PLANNER_ITEM_ROW.safeParse({ ...timedItem, google: { ...google, state: 'lost' } }).success,
    ).toBe(false);
  });
});

describe('planner repeat rules', () => {
  it('parses a rule into a strict structure', () => {
    const result = parsePlannerRrule('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;COUNT=6');
    expect(result.success && result.data.by_day).toEqual([{ ordinal: -1, weekday: 'FR' }]);
    expect(result.success && result.data.interval).toBe(2);
    expect(result.success && result.data.count).toBe(6);
  });

  it('rejects malformed, repeated and conflicting parts', () => {
    expect(parsePlannerRrule('FREQ=FORTNIGHTLY').success).toBe(false);
    expect(parsePlannerRrule('INTERVAL=2').success).toBe(false);
    expect(parsePlannerRrule('FREQ=DAILY;FREQ=WEEKLY').success).toBe(false);
    expect(parsePlannerRrule('FREQ=DAILY;COUNT=3;UNTIL=20261231').success).toBe(false);
    expect(parsePlannerRrule('FREQ=DAILY;BYSETPOS=1').success).toBe(false);
    expect(parsePlannerRrule('FREQ=WEEKLY;BYDAY=2MO').success).toBe(false);
    expect(parsePlannerRrule('FREQ=DAILY;X=1').success).toBe(false);
  });

  it('rejects a rule that can never occur and keeps leap day', () => {
    expect(parsePlannerRrule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30').success).toBe(false);
    expect(parsePlannerRrule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29').success).toBe(true);
    expect(parsePlannerRrule('FREQ=YEARLY;BYMONTH=2,4;BYMONTHDAY=30').success).toBe(true);
  });
});

describe('planner collections, completion and attachments', () => {
  it('accepts a colour key and rejects hex', () => {
    expect(PLANNER_COLLECTION_ROW.safeParse(collection).success).toBe(true);
    expect(PLANNER_COLLECTION_ROW.safeParse({ ...collection, colour: '#ff8800' }).success).toBe(
      false,
    );
    expect(PLANNER_COLLECTION_ROW.safeParse({ ...collection, colour: 'viz-2' }).success).toBe(
      false,
    );
  });

  it('ties the Google link to the source', () => {
    const google = { id: 'primary', etag: null, syncToken: null };
    expect(PLANNER_COLLECTION_ROW.safeParse({ ...collection, source: 'google' }).success).toBe(
      false,
    );
    expect(
      PLANNER_COLLECTION_ROW.safeParse({ ...collection, source: 'google', google }).success,
    ).toBe(true);
    expect(PLANNER_COLLECTION_ROW.safeParse({ ...collection, google }).success).toBe(false);
  });

  it('parses manual and signal completion', () => {
    expect(PLANNER_COMPLETION.safeParse({ kind: 'manual' }).success).toBe(true);
    const signal = {
      kind: 'signal',
      matcher: { source: 'treadmill', kind: 'session', match: { person: OTHER } },
      window: 'day',
    };
    expect(PLANNER_COMPLETION.safeParse(signal).success).toBe(true);
    expect(PLANNER_COMPLETION.safeParse({ ...signal, window: 'week' }).success).toBe(false);
    expect(PLANNER_COMPLETION.safeParse({ kind: 'signal', window: 'day' }).success).toBe(false);
  });

  it('parses the five attachment kinds', () => {
    const attachments = [
      { kind: 'device', deviceId: ID, face: null },
      { kind: 'device', deviceId: ID, face: 'wide' },
      { kind: 'scene', sceneId: ID },
      { kind: 'automation', automationId: ID },
      { kind: 'file', fileId: 'file-1' },
      { kind: 'link', url: 'https://example.com/a', title: null },
    ];
    for (const attachment of attachments) {
      expect(PLANNER_ATTACHMENT.safeParse(attachment).success).toBe(true);
    }
    expect(
      PLANNER_ATTACHMENT.safeParse({ kind: 'link', url: 'javascript:alert(1)', title: null })
        .success,
    ).toBe(false);
    expect(PLANNER_ATTACHMENT.safeParse({ kind: 'scene', sceneId: 'x' }).success).toBe(false);
  });
});

describe('planner occurrences', () => {
  const occurrence = {
    item_id: ID,
    occurrence_key: '2026-11-09T07:00:00Z',
    status: 'done',
    completed_at: NOW,
    completed_by: 'signal',
    evidence: { source: 'treadmill', deviceId: OTHER, summary: 'Walked 25 min', sessionId: null },
    moved_start: null,
    moved_end: null,
  };

  it('keeps a single, instant or date key', () => {
    for (const occurrence_key of ['single', '2026-11-09T07:00:00Z', '2026-12-25']) {
      expect(PLANNER_OCCURRENCE_ROW.safeParse({ ...occurrence, occurrence_key }).success).toBe(
        true,
      );
    }
    expect(
      PLANNER_OCCURRENCE_ROW.safeParse({ ...occurrence, occurrence_key: 'first' }).success,
    ).toBe(false);
  });

  it('ties completion and evidence to the done status', () => {
    expect(PLANNER_OCCURRENCE_ROW.safeParse({ ...occurrence, completed_at: null }).success).toBe(
      false,
    );
    const skipped = { ...occurrence, status: 'skipped', completed_at: null, completed_by: null };
    expect(PLANNER_OCCURRENCE_ROW.safeParse(skipped).success).toBe(false);
    expect(PLANNER_OCCURRENCE_ROW.safeParse({ ...skipped, evidence: null }).success).toBe(true);
  });
});

describe('planner alarms and rings', () => {
  const alarm = {
    id: ID,
    profile_id: OTHER,
    label: null,
    time: '07:00',
    days: [1, 2, 3, 4, 5],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'dawn',
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [{ kind: 'client', clientId: ID }],
    watch: [{ deviceId: OTHER, alarmId: 3, hash: 'abc', state: 'synced', detail: null }],
    source: 'planner',
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts a weekday alarm and rejects bad times and days', () => {
    expect(PLANNER_ALARM_ROW.safeParse(alarm).success).toBe(true);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, time: '7:00' }).success).toBe(false);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, days: [1, 1] }).success).toBe(false);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, days: [7] }).success).toBe(false);
  });

  it('rings once on a date or on weekdays, not both', () => {
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, once_on: '2026-11-20' }).success).toBe(false);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, days: [], once_on: '2026-11-20' }).success).toBe(
      true,
    );
  });

  it('sets the wake scene and its lead together and links each watch once', () => {
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, wake_scene_id: ID }).success).toBe(false);
    expect(
      PLANNER_ALARM_ROW.safeParse({ ...alarm, wake_scene_id: ID, wake_lead_minutes: 15 }).success,
    ).toBe(true);
    expect(
      PLANNER_ALARM_ROW.safeParse({ ...alarm, watch: [...alarm.watch, ...alarm.watch] }).success,
    ).toBe(false);
    const notOnWatch = {
      ...alarm.watch[0],
      alarmId: null,
      hash: null,
      state: 'not_on_watch',
      detail: 'repeats every second week',
    };
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, watch: [notOnWatch] }).success).toBe(true);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, source: 'phone' }).success).toBe(false);
  });

  const ring = {
    id: ID,
    kind: 'alarm',
    ref_id: OTHER,
    profile_id: OTHER,
    due_at: NOW,
    rang_at: NOW,
    dismissed_at: null,
    snoozes: 0,
    target: { kind: 'client', clientId: ID },
    outcome: 'rang',
    missed_reason: null,
  };

  it('records a missed ring with its reason and never as rung', () => {
    expect(PLANNER_RING_ROW.safeParse(ring).success).toBe(true);
    const missed = { ...ring, outcome: 'missed', rang_at: null, missed_reason: 'phone_off' };
    expect(PLANNER_RING_ROW.safeParse(missed).success).toBe(true);
    expect(PLANNER_RING_ROW.safeParse({ ...missed, missed_reason: null }).success).toBe(false);
    expect(PLANNER_RING_ROW.safeParse({ ...missed, rang_at: NOW }).success).toBe(false);
    expect(PLANNER_RING_ROW.safeParse({ ...ring, missed_reason: 'hub_down' }).success).toBe(false);
    expect(PLANNER_RING_ROW.safeParse({ ...missed, missed_reason: 'sleeping' }).success).toBe(
      false,
    );
  });
});

describe('planner timers and stopwatch', () => {
  const timer = {
    id: ID,
    profile_id: OTHER,
    label: 'Tea',
    duration_ms: 240_000,
    state: 'running',
    ends_at: NOW,
    remaining_ms: null,
    targets: [],
    created_at: NOW,
    updated_at: NOW,
  };

  it('holds the end instant while running and the remainder while paused', () => {
    expect(PLANNER_TIMER_ROW.safeParse(timer).success).toBe(true);
    expect(PLANNER_TIMER_ROW.safeParse({ ...timer, ends_at: null }).success).toBe(false);
    const paused = { ...timer, state: 'paused', ends_at: null, remaining_ms: 100_000 };
    expect(PLANNER_TIMER_ROW.safeParse(paused).success).toBe(true);
    expect(PLANNER_TIMER_ROW.safeParse({ ...paused, ends_at: NOW }).success).toBe(false);
    expect(PLANNER_TIMER_ROW.safeParse({ ...timer, duration_ms: 0 }).success).toBe(false);
  });

  it('holds the start instant only while running', () => {
    const stopwatch = {
      id: ID,
      profile_id: OTHER,
      running: true,
      started_at: NOW,
      accumulated_ms: 0,
      laps: [{ elapsed_ms: 5000, split_ms: 5000 }],
      updated_at: NOW,
    };
    expect(PLANNER_STOPWATCH_ROW.safeParse(stopwatch).success).toBe(true);
    expect(PLANNER_STOPWATCH_ROW.safeParse({ ...stopwatch, started_at: null }).success).toBe(false);
    expect(PLANNER_STOPWATCH_ROW.safeParse({ ...stopwatch, running: false }).success).toBe(false);
  });
});

describe('planner preferences', () => {
  const preferences = {
    general: {
      week_start: 1,
      day_start: '06:00',
      day_end: '23:00',
      working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:30' },
      shown_profile_id: null,
    },
    day_planner: {
      fade: 'soft',
      show_happened: true,
      show_sleep: true,
      show_weather: true,
      missed_scope: 'since_last_open',
    },
    tasks: {
      default_collection_id: null,
      smart_lists: ['today', 'overdue'],
      suggest_completion: true,
    },
    calendar: {
      default_view: 'week',
      default_reminders: [{ minutes_before: 10 }],
      show_tasks: true,
      show_alarms: true,
      show_sleep: false,
      show_free_time: false,
    },
    clock: {
      sound: 'dawn',
      ramp_seconds: 30,
      snooze_minutes: 9,
      targets: [],
      wake_scene_id: null,
      world_clocks: [{ time_zone: 'Asia/Tokyo', label: null }],
    },
    watch: { watch_alarm_sync: true, watch_calendar_push: true },
    ai: { briefing: 'after_alarm', evening_review: true, plan_suggestions: false },
  };

  it('accepts every group and stays strict', () => {
    expect(PLANNER_PREFERENCES.safeParse(preferences).success).toBe(true);
    expect(PLANNER_PREFERENCES.safeParse({ ...preferences, extra: {} }).success).toBe(false);
    const { ai, ...partial } = preferences;
    expect(ai.briefing).toBe('after_alarm');
    expect(PLANNER_PREFERENCES.safeParse(partial).success).toBe(false);
  });

  it('rejects a bad zone, time or view', () => {
    const clocks = { ...preferences.clock, world_clocks: [{ time_zone: 'Tokyo', label: null }] };
    expect(PLANNER_PREFERENCES.safeParse({ ...preferences, clock: clocks }).success).toBe(false);
    const general = { ...preferences.general, day_end: '25:00' };
    expect(PLANNER_PREFERENCES.safeParse({ ...preferences, general }).success).toBe(false);
    const calendar = { ...preferences.calendar, default_view: 'decade' };
    expect(PLANNER_PREFERENCES.safeParse({ ...preferences, calendar }).success).toBe(false);
  });
});
