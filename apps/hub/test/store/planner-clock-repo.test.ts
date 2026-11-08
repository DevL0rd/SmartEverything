import { DatabaseSync } from 'node:sqlite';
import {
  PLANNER_PREFERENCES,
  type LiveChange,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  PlannerAlarmsRepository,
  type PlannerAlarmInput,
} from '../../src/store/repositories/planner-alarms';
import { PlannerPreferencesRepository } from '../../src/store/repositories/planner-preferences';
import { PlannerRingsRepository } from '../../src/store/repositories/planner-rings';
import { PlannerStopwatchRepository } from '../../src/store/repositories/planner-stopwatch';
import { PlannerTimersRepository } from '../../src/store/repositories/planner-timers';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-07T08:00:00.000Z';
const CLIENT = '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f';
const DEVICE = '7d1e9a2c-8b3f-4c5d-a6e7-0f1a2b3c4d5e';
const REF = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';

let alarms: PlannerAlarmsRepository;
let timers: PlannerTimersRepository;
let stopwatches: PlannerStopwatchRepository;
let rings: PlannerRingsRepository;
let preferences: PlannerPreferencesRepository;
let changes: LiveChange[];
let ann: string;
let bob: string;

const alarm = (profileId: string, time: string): PlannerAlarmInput => ({
  profile_id: profileId,
  label: 'Wake',
  time,
  days: [1, 2, 3],
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
  targets: [{ kind: 'client', clientId: CLIENT }],
  watch: [{ deviceId: DEVICE, alarmId: 2, hash: 'h1', state: 'synced', detail: null }],
  source: 'planner',
});

const PREFERENCES: PlannerPreferences = PLANNER_PREFERENCES.parse({
  general: {
    week_start: 1,
    day_start: '06:00',
    day_end: '23:00',
    working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    shown_profile_id: null,
  },
  day_planner: {
    fade: 'soft',
    show_happened: true,
    show_sleep: true,
    show_weather: false,
    missed_scope: 'today',
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
    sound: 'sunrise',
    ramp_seconds: 30,
    snooze_minutes: 9,
    targets: [],
    wake_scene_id: null,
    world_clocks: [{ time_zone: 'Asia/Bangkok', label: null }],
  },
  watch: { watch_alarm_sync: true, watch_calendar_push: false },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: true },
});

beforeEach(() => {
  captureLogs();
  changes = [];
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const feed = new ChangeFeed(testLogger('store'));
  feed.subscribe((change) => changes.push(change));
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  const profiles = new ProfilesRepository(context);
  ann = profiles.create({ name: 'Ann' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  alarms = new PlannerAlarmsRepository(context);
  timers = new PlannerTimersRepository(context);
  stopwatches = new PlannerStopwatchRepository(context);
  rings = new PlannerRingsRepository(context);
  preferences = new PlannerPreferencesRepository(context);
  changes = [];
});

describe('planner alarms', () => {
  it('stores an alarm with its days, targets and watch links', () => {
    const row = alarms.insert(alarm(ann, '06:30'));
    expect(alarms.byId(row.id, ann)).toEqual(row);
    expect(row.watch[0]?.state).toBe('synced');
    expect(changes.map((change) => [change.table, change.operation])).toEqual([
      ['planner_alarms', 'INSERT'],
    ]);
  });

  it('lists a person alarms by time and every enabled alarm for the scheduler', () => {
    alarms.insert(alarm(ann, '07:30'));
    const early = alarms.insert(alarm(ann, '06:30'));
    const off = alarms.insert({ ...alarm(bob, '05:00'), enabled: false });
    expect(alarms.list(ann).map((row) => row.time)).toEqual(['06:30', '07:30']);
    expect(alarms.list(bob)).toEqual([off]);
    expect(alarms.enabled().map((row) => row.time)).toEqual(['06:30', '07:30']);
    expect(alarms.enabled()).toContainEqual(early);
  });

  it('changes an alarm only for its owner and refuses a rule it breaks', () => {
    const row = alarms.insert(alarm(ann, '06:30'));
    changes = [];
    const after = alarms.update(row.id, ann, { enabled: false, skip_on: '2026-11-09' });
    expect(after.enabled).toBe(false);
    expect(changes[0]).toMatchObject({ operation: 'UPDATE', oldRecord: { enabled: true } });
    expect(() => alarms.update(row.id, bob, { enabled: true })).toThrow();
    expect(() => alarms.update(row.id, ann, { once_on: '2026-11-09' })).toThrow();
    expect(alarms.byId(row.id, ann).once_on).toBeNull();
  });

  it('removes an alarm and announces it', () => {
    const row = alarms.insert(alarm(ann, '06:30'));
    changes = [];
    alarms.remove(row.id, ann);
    expect(alarms.find(row.id, ann)).toBeUndefined();
    expect(changes[0]).toMatchObject({ operation: 'DELETE', record: null });
  });
});

describe('planner rings', () => {
  const ring = (profileId: string, dueAt: string) =>
    ({
      kind: 'alarm',
      ref_id: REF,
      profile_id: profileId,
      due_at: dueAt,
      rang_at: dueAt,
      dismissed_at: null,
      snoozes: 0,
      target: { kind: 'client', clientId: CLIENT },
      outcome: 'rang',
      missed_reason: null,
    }) as const;

  it('keeps what rang and what is still ringing until it is dismissed', () => {
    const first = rings.insert(ring(ann, '2026-11-07T06:30:00.000Z'));
    rings.insert(ring(bob, '2026-11-07T06:30:00.000Z'));
    expect(rings.ringing(ann)).toEqual([first]);
    const snoozed = rings.update(first.id, { snoozes: 1 });
    expect(rings.byId(first.id)).toEqual(snoozed);
    rings.update(first.id, { dismissed_at: '2026-11-07T06:31:00.000Z' });
    expect(rings.ringing(ann)).toEqual([]);
    expect(rings.forRef('alarm', REF)).toHaveLength(2);
    expect(rings.forRef('timer', REF)).toEqual([]);
  });

  it('records a missed ring with its reason and reads it by window', () => {
    const missed = rings.insert({
      ...ring(ann, '2026-11-07T06:30:00.000Z'),
      rang_at: null,
      target: null,
      outcome: 'missed',
      missed_reason: 'hub_down',
    });
    rings.insert(ring(ann, '2026-11-08T06:30:00.000Z'));
    const window = { from: '2026-11-07T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' };
    expect(rings.missed(ann, window)).toEqual([missed]);
    expect(rings.between(ann, window)).toEqual([missed]);
    expect(rings.missed(bob, window)).toEqual([]);
  });

  it('refuses a missed ring without a reason', () => {
    expect(() =>
      rings.insert({ ...ring(ann, '2026-11-07T06:30:00.000Z'), rang_at: null, outcome: 'missed' }),
    ).toThrow();
  });
});

describe('planner timers', () => {
  const running = (profileId: string, endsAt: string) =>
    ({
      profile_id: profileId,
      label: 'Pasta',
      duration_ms: 600000,
      state: 'running',
      ends_at: endsAt,
      remaining_ms: null,
      targets: [],
    }) as const;

  it('lists the running timers by end instant for the scheduler', () => {
    const late = timers.insert(running(ann, '2026-11-07T08:20:00.000Z'));
    const soon = timers.insert(running(bob, '2026-11-07T08:05:00.000Z'));
    const paused = timers.insert({
      ...running(ann, NOW),
      state: 'paused',
      ends_at: null,
      remaining_ms: 1000,
    });
    expect(timers.running().map((row) => row.id)).toEqual([soon.id, late.id]);
    expect(
      timers
        .list(ann)
        .map((row) => row.id)
        .sort(),
    ).toEqual([late.id, paused.id].sort());
  });

  it('pauses a timer into the remaining time and refuses a half-paused one', () => {
    const row = timers.insert(running(ann, '2026-11-07T08:10:00.000Z'));
    changes = [];
    const after = timers.update(row.id, ann, {
      state: 'paused',
      ends_at: null,
      remaining_ms: 120000,
    });
    expect(timers.byId(row.id, ann)).toEqual(after);
    expect(changes[0]).toMatchObject({ table: 'planner_timers', operation: 'UPDATE' });
    expect(() => timers.update(row.id, ann, { remaining_ms: null })).toThrow();
    expect(() => timers.update(row.id, bob, { label: null })).toThrow();
    timers.remove(row.id, ann);
    expect(timers.find(row.id, ann)).toBeUndefined();
  });
});

describe('planner stopwatch', () => {
  it('keeps one stopwatch per person and records laps', () => {
    expect(stopwatches.find(ann)).toBeUndefined();
    const row = stopwatches.insert({
      profile_id: ann,
      running: true,
      started_at: NOW,
      accumulated_ms: 0,
      laps: [],
    });
    expect(stopwatches.forProfile(ann)).toEqual(row);
    expect(stopwatches.find(bob)).toBeUndefined();
    changes = [];
    const stopped = stopwatches.update(ann, {
      running: false,
      started_at: null,
      accumulated_ms: 5000,
      laps: [{ elapsed_ms: 5000, split_ms: 5000 }],
    });
    expect(stopwatches.forProfile(ann)).toEqual(stopped);
    expect(changes[0]).toMatchObject({ table: 'planner_stopwatches', operation: 'UPDATE' });
    expect(() => stopwatches.update(ann, { running: true })).toThrow();
    stopwatches.remove(ann);
    expect(stopwatches.find(ann)).toBeUndefined();
  });
});

describe('planner preferences', () => {
  it('saves and replaces one document per person', () => {
    expect(preferences.find(ann)).toBeUndefined();
    const saved = preferences.put(ann, PREFERENCES);
    expect(preferences.find(ann)).toEqual(saved);
    const changed = preferences.put(ann, {
      ...PREFERENCES,
      watch: { watch_alarm_sync: false, watch_calendar_push: true },
    });
    expect(preferences.find(ann)?.preferences.watch.watch_alarm_sync).toBe(false);
    expect(changed.profile_id).toBe(ann);
    expect(preferences.find(bob)).toBeUndefined();
  });
});
