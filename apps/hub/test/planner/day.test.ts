import {
  PLANNER_PREFERENCES,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeDay, composeDayFromStore, frameOf, summarise } from '../../src/planner/day';
import { instantsOf, recomputeInstants } from '../../src/planner/instants';
import { expandOccurrences, type ExpandWindow } from '../../src/planner/occurrences';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW_TEXT = '2026-11-07T10:00:00.000Z';
const NOW = Temporal.Instant.from(NOW_TEXT);
const STAMP = '2026-11-01T00:00:00.000Z';
const COLLECTION = id(900);
const PROFILE = id(901);
const DEVICE = id(902);

const PREFERENCES: PlannerPreferences = PLANNER_PREFERENCES.parse({
  general: {
    week_start: 1,
    day_start: '07:00',
    day_end: '22:00',
    working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    shown_profile_id: null,
  },
  day_planner: {
    fade: 'soft',
    show_happened: true,
    show_sleep: true,
    show_weather: true,
    missed_scope: 'today',
  },
  tasks: { default_collection_id: null, smart_lists: ['today'], suggest_completion: true },
  calendar: {
    default_view: 'week',
    default_reminders: [],
    show_tasks: true,
    show_alarms: true,
    show_sleep: true,
    show_free_time: true,
  },
  clock: {
    sound: 'sunrise',
    ramp_seconds: 0,
    snooze_minutes: 9,
    targets: [],
    wake_scene_id: null,
    world_clocks: [],
  },
  watch: { watch_alarm_sync: false, watch_calendar_push: false },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: false },
});

function id(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

let serial = 0;

function item(change: Partial<PlannerItemRow> = {}): PlannerItemRow {
  serial += 1;
  return {
    id: id(serial),
    profile_id: PROFILE,
    collection_id: COLLECTION,
    kind: 'event',
    parent_id: null,
    title: `Item ${serial.toString()}`,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: 'UTC',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: serial,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...change,
  };
}

function task(start: string, change: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return item({ kind: 'task', start_local: start, ...change });
}

function allDay(date: string, change: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return item({ start_local: date, end_local: date, all_day: true, time_zone: null, ...change });
}

function row(
  itemId: string,
  key: string,
  change: Partial<PlannerOccurrenceRow> = {},
): PlannerOccurrenceRow {
  return {
    item_id: itemId,
    occurrence_key: key,
    status: 'done',
    completed_at: '2026-11-07T07:35:00.000Z',
    completed_by: 'person',
    evidence: null,
    moved_start: null,
    moved_end: null,
    ...change,
  };
}

function window(from: string, to: string, timeZone = 'UTC'): ExpandWindow {
  return { from: Temporal.Instant.from(from), to: Temporal.Instant.from(to), timeZone };
}

function expand(
  items: readonly PlannerItemRow[],
  span: ExpandWindow,
  stored: readonly PlannerOccurrenceRow[] = [],
): readonly { readonly start: string | null; readonly key: string; readonly title: string }[] {
  return expandOccurrences({ items, stored, window: span, now: NOW }).map((view) => ({
    start: view.start,
    key: view.occurrence_key,
    title: view.title,
  }));
}

describe('expanding repeats', () => {
  it('keeps the wall time across a DST change and keys each occurrence by its instant', () => {
    const daily = item({
      title: 'Standup',
      start_local: '2026-03-27T09:00',
      end_local: '2026-03-27T10:00',
      time_zone: 'Europe/Berlin',
      rrule: 'FREQ=DAILY',
    });
    const views = expandOccurrences({
      items: [daily],
      stored: [],
      window: window('2026-03-28T00:00:00Z', '2026-03-31T00:00:00Z', 'Europe/Berlin'),
      now: NOW,
    });
    expect(views.map((view) => [view.start, view.end, view.occurrence_key])).toEqual([
      ['2026-03-28T08:00:00.000Z', '2026-03-28T09:00:00.000Z', '2026-03-28T08:00:00.000Z'],
      ['2026-03-29T07:00:00.000Z', '2026-03-29T08:00:00.000Z', '2026-03-29T07:00:00.000Z'],
      ['2026-03-30T07:00:00.000Z', '2026-03-30T08:00:00.000Z', '2026-03-30T07:00:00.000Z'],
    ]);
    expect(views.every((view) => view.recurring && !view.moved)).toBe(true);
  });

  it('replaces an original with its override and drops excluded dates', () => {
    const master = item({
      title: 'Standup',
      start_local: '2026-11-09T09:00',
      end_local: null,
      rrule: 'FREQ=DAILY',
      exdates: ['2026-11-13T09:00'],
    });
    const later = item({
      title: 'Standup (later)',
      series_id: master.id,
      original_start: '2026-11-10T09:00',
      start_local: '2026-11-10T14:00',
    });
    const other = item({
      title: 'Standup (other day)',
      series_id: master.id,
      original_start: '2026-11-11T09:00',
      start_local: '2026-11-12T08:00',
    });
    const views = expandOccurrences({
      items: [master, later, other],
      stored: [],
      window: window('2026-11-09T00:00:00Z', '2026-11-14T00:00:00Z'),
      now: NOW,
    });
    expect(views.map((view) => [view.title, view.start, view.moved])).toEqual([
      ['Standup', '2026-11-09T09:00:00.000Z', false],
      ['Standup (later)', '2026-11-10T14:00:00.000Z', true],
      ['Standup (other day)', '2026-11-12T08:00:00.000Z', true],
      ['Standup', '2026-11-12T09:00:00.000Z', false],
    ]);
    const changed = views.find((view) => view.title === 'Standup (later)');
    expect(changed).toMatchObject({ item_id: later.id, occurrence_key: 'single', recurring: true });
  });

  it('moves one occurrence out of a window and into another', () => {
    const master = item({ start_local: '2026-11-09T09:00', rrule: 'FREQ=DAILY' });
    const moved = row(master.id, '2026-11-10T09:00:00.000Z', {
      status: 'missed',
      completed_at: null,
      completed_by: null,
      moved_start: '2026-11-20T18:00:00.000Z',
    });
    const day = window('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');
    expect(expand([master], day, [moved])).toEqual([]);
    const later = expand([master], window('2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z'), [moved]);
    expect(later.map((view) => [view.start, view.key])).toEqual([
      ['2026-11-20T09:00:00.000Z', '2026-11-20T09:00:00.000Z'],
      ['2026-11-20T18:00:00.000Z', '2026-11-10T09:00:00.000Z'],
    ]);
    const views = expandOccurrences({
      items: [master],
      stored: [moved],
      window: window('2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z'),
      now: NOW,
    });
    expect(views.map((view) => [view.moved, view.status])).toEqual([
      [false, 'open'],
      [true, 'open'],
    ]);
  });

  it('keys an all-day repeat by its date', () => {
    const weekly = allDay('2026-11-02', { rrule: 'FREQ=WEEKLY', title: 'Bins' });
    const keys = expand([weekly], window('2026-11-09T00:00:00Z', '2026-11-24T00:00:00Z')).map(
      (view) => view.key,
    );
    expect(keys).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('reports done with evidence and a done non-repeating item', () => {
    const brush = task('2026-11-07T07:30', { title: 'Brush teeth' });
    const evidence = {
      source: 'oralb',
      deviceId: DEVICE,
      summary: '2:04 brushed',
      sessionId: 's1',
    };
    const [view] = expandOccurrences({
      items: [brush],
      stored: [row(brush.id, 'single', { completed_by: 'signal', evidence })],
      window: window('2026-11-07T00:00:00Z', '2026-11-08T00:00:00Z'),
      now: NOW,
    });
    expect(view).toMatchObject({ status: 'done', completed_by: 'signal', evidence });
  });
});

describe('all-day items keep their date', () => {
  const holiday = allDay('2026-11-07', { title: 'Holiday' });

  it.each([
    ['Pacific/Auckland', '2026-11-07', true],
    ['Pacific/Auckland', '2026-11-08', false],
    ['America/Los_Angeles', '2026-11-06', false],
    ['America/Los_Angeles', '2026-11-07', true],
    ['America/Los_Angeles', '2026-11-08', false],
  ])('in %s on %s it is shown: %s', (zone, date, shown) => {
    const frame = frameOf({
      date,
      timeZone: zone,
      now: NOW,
      preferences: PREFERENCES,
      lastOpen: null,
    });
    const day = composeDay({
      frame,
      now: NOW,
      preferences: PREFERENCES,
      items: [holiday],
      stored: [],
      rings: [],
      alarmPins: [],
      nextAlarmAt: null,
      sleep: [],
      sessions: [],
    });
    expect(day.upcoming.map((view) => view.title)).toEqual(shown ? ['Holiday'] : []);
  });
});

describe('the composed day', () => {
  const brush = task('2026-11-07T07:30', { title: 'Brush teeth' });
  const vitamins = task('2026-11-07T08:00', { title: 'Vitamins' });
  const workout = task('2026-11-07T09:30', { title: 'Workout', end_local: '2026-11-07T10:30' });
  const call = task('2026-11-07T12:00', { title: 'Call' });
  const skipped = task('2026-11-07T11:00', { title: 'Skipped' });
  const planning = item({
    title: 'Planning',
    start_local: '2026-11-07T14:00',
    end_local: '2026-11-07T15:00',
  });
  const early = item({
    title: 'Early',
    start_local: '2026-11-07T08:00',
    end_local: '2026-11-07T09:00',
  });
  const dateOnly = item({ kind: 'task', title: 'Pay rent', due_date: '2026-11-07' });
  const yesterday = item({ kind: 'task', title: 'Water plants', due_date: '2026-11-06' });
  const items = [brush, vitamins, workout, call, skipped, planning, early, dateOnly, yesterday];
  const evidence = { source: 'oralb', deviceId: DEVICE, summary: '2:04 brushed', sessionId: 's1' };
  const stored = [
    row(brush.id, 'single', { completed_by: 'signal', evidence }),
    row(skipped.id, 'single', { status: 'skipped', completed_at: null, completed_by: null }),
  ];
  const sessions = [
    {
      at: Temporal.Instant.from('2026-11-07T07:35:00Z'),
      source: 'oralb',
      deviceId: DEVICE,
      summary: '2:04 brushed',
      sessionId: 's1',
    },
    {
      at: Temporal.Instant.from('2026-11-07T06:00:00Z'),
      source: 'kingsmith',
      deviceId: id(903),
      summary: '28 min walk',
      sessionId: 's2',
    },
    {
      at: Temporal.Instant.from('2026-11-06T06:00:00Z'),
      source: 'kingsmith',
      deviceId: id(903),
      summary: 'Yesterday',
      sessionId: 's0',
    },
  ];

  function compose(
    preferences = PREFERENCES,
    lastOpen: Temporal.Instant | null = null,
  ): PlannerDay {
    return composeDay({
      frame: frameOf({ date: '2026-11-07', timeZone: 'UTC', now: NOW, preferences, lastOpen }),
      now: NOW,
      preferences,
      items,
      stored,
      rings: [],
      alarmPins: [{ at: Temporal.Instant.from('2026-11-07T06:30:00Z'), label: 'Wake' }],
      nextAlarmAt: Temporal.Instant.from('2026-11-08T06:30:00Z'),
      sleep: [
        {
          from: Temporal.Instant.from('2026-11-06T23:00:00Z'),
          to: Temporal.Instant.from('2026-11-07T06:00:00Z'),
        },
      ],
      sessions,
    });
  }

  const titles = (views: readonly { readonly title: string }[]): string[] =>
    views.map((view) => view.title);

  it('sorts missed, now, upcoming and done and hides skipped and ended events', () => {
    const day = compose();
    expect(titles(day.missed)).toEqual(['Vitamins']);
    expect(titles(day.current)).toEqual(['Workout']);
    expect(titles(day.upcoming)).toEqual(['Pay rent', 'Call', 'Planning']);
    expect(titles(day.done)).toEqual(['Brush teeth']);
    expect(day.done[0]?.evidence).toEqual(evidence);
    expect(day.missed[0]?.status).toBe('missed');
  });

  it('shows what happened with no matching task and none already used as evidence', () => {
    expect(compose().happened).toEqual([
      {
        at: '2026-11-07T06:00:00.000Z',
        source: 'kingsmith',
        deviceId: id(903),
        summary: '28 min walk',
      },
    ]);
    const quiet = PLANNER_PREFERENCES.parse({
      ...PREFERENCES,
      day_planner: { ...PREFERENCES.day_planner, show_happened: false },
    });
    expect(compose(quiet).happened).toEqual([]);
  });

  it('adds earlier missed items since the last open and not in today scope', () => {
    const since = PLANNER_PREFERENCES.parse({
      ...PREFERENCES,
      day_planner: { ...PREFERENCES.day_planner, missed_scope: 'since_last_open' },
    });
    const lastOpen = Temporal.Instant.from('2026-11-05T12:00:00Z');
    expect(titles(compose(since, lastOpen).missed)).toEqual(['Water plants', 'Vitamins']);
    expect(titles(compose(PREFERENCES, lastOpen).missed)).toEqual(['Vitamins']);
  });

  it('gives the summary fields', () => {
    expect(summarise(compose())).toEqual({
      missed: 1,
      left: 3,
      nextAlarmAt: '2026-11-08T06:30:00.000Z',
    });
  });

  it('builds the strip with the alarm pin, last night sleep and the free time between', () => {
    const strip = compose().strip;
    expect(strip.filter((segment) => segment.kind === 'alarm')).toMatchObject([
      { from: '2026-11-07T06:30:00.000Z', to: '2026-11-07T06:30:00.000Z', label: 'Wake' },
    ]);
    expect(strip.filter((segment) => segment.kind === 'sleep')).toMatchObject([
      { from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T06:00:00.000Z' },
    ]);
    expect(
      strip.filter((segment) => segment.kind === 'event').map((s) => [s.label, s.from, s.to]),
    ).toEqual([
      ['Early', '2026-11-07T08:00:00.000Z', '2026-11-07T09:00:00.000Z'],
      ['Planning', '2026-11-07T14:00:00.000Z', '2026-11-07T15:00:00.000Z'],
    ]);
    expect(strip.filter((segment) => segment.kind === 'free').map((s) => [s.from, s.to])).toEqual([
      ['2026-11-07T07:00:00.000Z', '2026-11-07T08:00:00.000Z'],
      ['2026-11-07T09:00:00.000Z', '2026-11-07T09:30:00.000Z'],
      ['2026-11-07T10:30:00.000Z', '2026-11-07T14:00:00.000Z'],
      ['2026-11-07T15:00:00.000Z', '2026-11-07T22:00:00.000Z'],
    ]);
  });
});

describe('derived instants', () => {
  it('derives the last instant of a counted series', () => {
    const counted = instantsOf({
      start_local: '2026-11-02T09:00',
      end_local: '2026-11-02T10:00',
      time_zone: 'UTC',
      all_day: false,
      rrule: 'FREQ=DAILY;COUNT=3',
    });
    expect(counted).toEqual({
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-02T10:00:00.000Z',
      series_end: '2026-11-04T10:00:00.000Z',
    });
    expect(
      instantsOf({
        start_local: '2026-11-02T09:00',
        end_local: null,
        time_zone: 'UTC',
        all_day: false,
        rrule: 'FREQ=DAILY',
      }).series_end,
    ).toBeNull();
  });
});

describe('with the store', () => {
  let test: TestStore;
  let owner: TestPerson;
  let collectionId: string;

  beforeEach(async () => {
    test = await testStore(() => new Date(NOW_TEXT));
    owner = addPerson(test, 'Owner', 'owner');
    collectionId = test.store.plannerCollections.insert({
      profile_id: owner.profileId,
      kind: 'calendar',
      name: 'Work',
      colour: 'work',
      icon: 'briefcase',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
  });

  afterEach(async () => {
    await test.close();
  });

  function insert(change: Partial<PlannerItemRow>): PlannerItemRow {
    const { id: _id, created_at: _c, updated_at: _u, deleted_at: _d, ...base } = item(change);
    const timing = { ...base, ...instantsOf(base) };
    return test.store.plannerItems.insert({
      ...timing,
      profile_id: owner.profileId,
      collection_id: collectionId,
    });
  }

  it('recomputes stored instants on start once', () => {
    const dentist = insert({
      title: 'Dentist',
      start_local: '2026-03-28T22:00',
      end_local: '2026-03-29T01:00',
      time_zone: 'Europe/Berlin',
    });
    test.store.plannerItems.update(dentist.id, owner.profileId, {
      start: '2026-03-28T22:00:00.000Z',
      end: '2026-03-29T01:00:00.000Z',
    });
    expect(recomputeInstants(test.store)).toBe(1);
    expect(test.store.plannerItems.byId(dentist.id, owner.profileId)).toMatchObject({
      start: '2026-03-28T21:00:00.000Z',
      end: '2026-03-29T00:00:00.000Z',
    });
    expect(recomputeInstants(test.store)).toBe(0);
  });

  it('composes a day from the tables, with alarm pins and the next alarm', () => {
    const standup = insert({
      title: 'Standup',
      start_local: '2026-11-02T11:00',
      end_local: '2026-11-02T11:30',
      rrule: 'FREQ=DAILY',
    });
    insert({ kind: 'task', title: 'Report', start_local: '2026-11-07T08:00' });
    test.store.plannerAlarms.insert({
      profile_id: owner.profileId,
      label: 'Wake',
      time: '06:30',
      days: [],
      once_on: null,
      skip_on: null,
      enabled: true,
      sound: 'sunrise',
      ramp_seconds: 0,
      vibrate: true,
      snooze_minutes: 9,
      smart_minutes: null,
      wake_scene_id: null,
      wake_lead_minutes: null,
      targets: [],
      watch: [],
      source: 'planner',
    });
    const day = composeDayFromStore(test.store, {
      profileId: owner.profileId,
      date: '2026-11-07',
      timeZone: 'UTC',
      now: NOW,
      lastOpen: null,
      preferences: PREFERENCES,
      sleep: [],
      sessions: [],
    });
    expect(day.missed.map((view) => view.title)).toEqual(['Report']);
    expect(day.upcoming.map((view) => [view.item_id, view.start])).toEqual([
      [standup.id, '2026-11-07T11:00:00.000Z'],
    ]);
    expect(day.next_alarm_at).toBe('2026-11-08T06:30:00.000Z');
    expect(day.strip.filter((segment) => segment.kind === 'alarm')).toHaveLength(1);
  });
});
