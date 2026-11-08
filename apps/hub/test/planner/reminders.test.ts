import {
  PLANNER_RING_NOTICE,
  PLANNER_SUMMARY_NOTICE,
  type PlannerItemRow,
  type PlannerPreferences,
  type PlannerRingNotice,
  type PlannerSummaryNotice,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { instantsOf } from '../../src/planner/instants';
import { ReminderScheduler, type ReminderPull } from '../../src/planner/reminders';
import { SummaryDesk } from '../../src/planner/summary';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';
const ZONE = 'Europe/Berlin';

const PREFERENCES: PlannerPreferences = {
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
    show_weather: true,
    missed_scope: 'since_last_open',
  },
  tasks: { default_collection_id: null, smart_lists: ['today'], suggest_completion: true },
  calendar: {
    default_view: 'week',
    default_reminders: [],
    show_tasks: true,
    show_alarms: true,
    show_sleep: true,
    show_free_time: false,
  },
  clock: {
    sound: 'default',
    ramp_seconds: 0,
    snooze_minutes: 9,
    targets: [],
    wake_scene_id: null,
    world_clocks: [],
  },
  watch: { watch_alarm_sync: false, watch_calendar_push: false },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: false },
};

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let collectionId: string;
let signals: SignalInput[];
let notices: PlannerRingNotice[];
let summaries: PlannerSummaryNotice[];
let summary: SummaryDesk;
let scheduler: ReminderScheduler;

function build(pull?: ReminderPull): ReminderScheduler {
  return new ReminderScheduler({
    store: test.store,
    clock,
    emit: (signal): void => {
      signals.push(signal);
    },
    summary,
    log: testLogger(),
    ...(pull === undefined ? {} : { pull }),
  });
}

function add(change: Partial<PlannerItemInput>): PlannerItemRow {
  const base: PlannerItemInput = {
    profile_id: owner.profileId,
    collection_id: collectionId,
    kind: 'event',
    parent_id: null,
    title: 'Standup',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: ZONE,
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
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    ...change,
  };
  return test.store.plannerItems.insert({ ...base, ...instantsOf(base) });
}

function standup(change: Partial<PlannerItemInput> = {}): PlannerItemRow {
  return add({
    start_local: '2026-11-07T10:00',
    end_local: '2026-11-07T10:30',
    reminders: [{ minutes_before: 10 }],
    ...change,
  });
}

function rings(itemId: string): ReturnType<typeof test.store.plannerRings.forRef> {
  return test.store.plannerRings.forRef('reminder', itemId);
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: ZONE });
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
  signals = [];
  notices = [];
  summaries = [];
  test.store.feed.subscribeNotices((notice) => {
    if (notice.type === 'planner_ring') notices.push(PLANNER_RING_NOTICE.parse(notice));
    if (notice.type === 'planner_summary') summaries.push(PLANNER_SUMMARY_NOTICE.parse(notice));
  });
  summary = new SummaryDesk({
    store: test.store,
    clock,
    preferencesOf: (): PlannerPreferences => PREFERENCES,
    log: testLogger(),
  });
  scheduler = build();
});

afterEach(async () => {
  scheduler.stop();
  summary.stop();
  await test.close();
});

describe('reminders', () => {
  it('rings at the reminder instant with a ring row, a notice and an event signal', () => {
    const meeting = standup();
    scheduler.start();
    expect(clock.pending()).toEqual(['2026-11-07T08:50:00.000Z']);
    clock.advanceTo('2026-11-07T08:50:00.000Z');
    const [ring] = rings(meeting.id);
    expect(ring).toMatchObject({
      kind: 'reminder',
      outcome: 'rang',
      due_at: '2026-11-07T08:50:00.000Z',
      missed_reason: null,
    });
    expect(notices).toEqual([
      {
        type: 'planner_ring',
        ringId: ring?.id,
        kind: 'reminder',
        refId: meeting.id,
        dueAt: '2026-11-07T08:50:00.000Z',
      },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: 'planner',
      kind: 'event_starting',
      subject: meeting.id,
      data: { title: 'Standup', startsAt: '2026-11-07T09:00:00.000Z', minutesBefore: 10 },
    });
    expect(clock.pending()).toEqual([]);
  });

  it('rings a task reminder with a task_due signal', () => {
    const report = add({
      kind: 'task',
      title: 'Report',
      due_at: '2026-11-07T12:00:00.000Z',
      reminders: [{ minutes_before: 60 }, { minutes_before: 0 }],
    });
    scheduler.start();
    clock.advanceTo('2026-11-07T12:00:00.000Z');
    expect(rings(report.id).map((ring) => ring.due_at)).toEqual([
      '2026-11-07T11:00:00.000Z',
      '2026-11-07T12:00:00.000Z',
    ]);
    expect(signals.map((signal) => signal.kind)).toEqual(['task_due', 'task_due', 'task_missed']);
  });

  it('keeps arming the next occurrence of a repeating item', () => {
    const daily = standup({ rrule: 'FREQ=DAILY' });
    scheduler.start();
    clock.advanceTo('2026-11-08T08:50:00.000Z');
    expect(rings(daily.id).map((ring) => ring.due_at)).toEqual([
      '2026-11-07T08:50:00.000Z',
      '2026-11-08T08:50:00.000Z',
    ]);
    expect(clock.pending()).toEqual(['2026-11-09T08:50:00.000Z']);
  });

  it('re-arms on every write', () => {
    const meeting = standup();
    scheduler.start();
    test.store.plannerItems.update(meeting.id, owner.profileId, {
      reminders: [{ minutes_before: 30 }],
    });
    expect(clock.pending()).toEqual(['2026-11-07T08:30:00.000Z']);
    test.store.plannerItems.update(meeting.id, owner.profileId, { status: 'cancelled' });
    expect(clock.pending()).toEqual([]);
  });

  it('does not ring for an occurrence that is done', () => {
    const meeting = standup();
    scheduler.start();
    test.store.plannerOccurrences.save({
      item_id: meeting.id,
      occurrence_key: 'single',
      status: 'skipped',
      completed_at: null,
      completed_by: null,
      evidence: null,
      moved_start: null,
      moved_end: null,
    });
    clock.advanceTo('2026-11-07T09:30:00.000Z');
    expect(rings(meeting.id)).toEqual([]);
    expect(signals).toEqual([]);
  });

  it('records a reminder found overdue after a hub restart as missed, never late', () => {
    const meeting = standup();
    scheduler.start();
    scheduler.stop();
    clock.jumpTo('2026-11-07T08:55:00.000Z');
    scheduler = build();
    scheduler.start();
    expect(rings(meeting.id)).toEqual([
      expect.objectContaining({
        outcome: 'missed',
        missed_reason: 'hub_down',
        rang_at: null,
        due_at: '2026-11-07T08:50:00.000Z',
      }),
    ]);
    expect(signals).toEqual([]);
    expect(clock.pending()).toEqual([]);
    scheduler.stop();
    scheduler = build();
    scheduler.start();
    expect(rings(meeting.id)).toHaveLength(1);
  });

  it('records the reminder missed as computer asleep when the machine resumes', () => {
    const meeting = standup();
    scheduler.start();
    clock.jumpTo('2026-11-07T09:05:00.000Z');
    scheduler.resumed();
    expect(rings(meeting.id)).toEqual([
      expect.objectContaining({ outcome: 'missed', missed_reason: 'computer_asleep' }),
    ]);
  });

  it('pulls Google before a Google reminder rings', async () => {
    const order: string[] = [];
    const pull = vi.fn<ReminderPull>(() => {
      order.push(`pull:${String(rings(meeting.id).length)}`);
      return Promise.resolve();
    });
    scheduler = build(pull);
    const meeting = standup({
      google: { id: 'g1', calendarOrListId: 'c1', etag: null, base: {}, state: 'synced' },
    });
    scheduler.start();
    clock.advanceTo('2026-11-07T08:50:00.000Z');
    await vi.waitFor(() => {
      expect(rings(meeting.id)).toHaveLength(1);
    });
    expect(order).toEqual(['pull:0']);
    expect(pull).toHaveBeenCalledOnce();
  });

  it('still rings when the Google pull fails', async () => {
    scheduler = build(() => Promise.reject(new Error('offline')));
    const meeting = standup({
      google: { id: 'g1', calendarOrListId: 'c1', etag: null, base: {}, state: 'synced' },
    });
    scheduler.start();
    clock.advanceTo('2026-11-07T08:50:00.000Z');
    await vi.waitFor(() => {
      expect(rings(meeting.id)).toHaveLength(1);
    });
  });
});

describe('summary notice', () => {
  function mine(): PlannerSummaryNotice[] {
    return summaries.filter((notice) => notice.personId === owner.profileId);
  }

  it('publishes on hub start and then only when the summary changed', () => {
    scheduler.start();
    summary.start();
    expect(mine()).toEqual([
      {
        type: 'planner_summary',
        personId: owner.profileId,
        missed: 0,
        left: 0,
        nextAlarmAt: null,
        runningTimers: 0,
      },
    ]);
    add({ kind: 'task', title: 'Report', due_at: '2026-11-07T09:30:00.000Z' });
    expect(mine().at(-1)).toMatchObject({ missed: 0, left: 1 });
    expect(mine()).toHaveLength(2);
  });

  it('does not publish for a write that leaves the summary unchanged', () => {
    const report = add({ kind: 'task', title: 'Report', due_at: '2026-11-07T09:30:00.000Z' });
    summary.start();
    const before = mine().length;
    test.store.plannerItems.update(report.id, owner.profileId, { notes: 'draft' });
    expect(mine()).toHaveLength(before);
  });

  it('publishes when an occurrence becomes missed at its due time, on the reminder timer', () => {
    add({ kind: 'task', title: 'Report', due_at: '2026-11-07T09:30:00.000Z' });
    scheduler.start();
    summary.start();
    expect(mine().at(-1)).toMatchObject({ missed: 0, left: 1 });
    expect(clock.pending()).toEqual(['2026-11-07T09:30:00.000Z']);
    clock.advanceTo('2026-11-07T09:30:00.000Z');
    expect(mine().at(-1)).toMatchObject({ missed: 1, left: 0 });
    expect(signals.map((signal) => signal.kind)).toEqual(['task_missed']);
  });

  it('counts a running timer and the next alarm from any service write', () => {
    summary.start();
    test.store.plannerTimers.insert({
      profile_id: owner.profileId,
      label: null,
      duration_ms: 60_000,
      state: 'running',
      ends_at: '2026-11-07T08:01:00.000Z',
      remaining_ms: null,
      targets: [],
    });
    expect(mine().at(-1)).toMatchObject({ runningTimers: 1 });
  });
});
