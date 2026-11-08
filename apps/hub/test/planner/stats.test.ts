import {
  PLANNER_STATS,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerStats,
  type PlannerStatsRange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantsOf } from '../../src/planner/instants';
import { composeStats } from '../../src/planner/stats';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW_TEXT = '2026-11-07T10:00:00.000Z';
const NOW = Temporal.Instant.from(NOW_TEXT);
const ALARM = id(700);

function id(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

let test: TestStore;
let owner: TestPerson;
let member: TestPerson;
let work: string;
let home: string;
let errands: string;

function collection(profileId: string, kind: 'calendar' | 'list', name: string): string {
  return test.store.plannerCollections.insert({
    profile_id: profileId,
    kind,
    name,
    colour: 'work',
    icon: 'list',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
  }).id;
}

function insert(
  collectionId: string,
  change: Partial<PlannerItemRow>,
  profileId = owner.profileId,
): PlannerItemRow {
  const base = {
    profile_id: profileId,
    collection_id: collectionId,
    kind: 'task' as const,
    parent_id: null,
    title: 'Item',
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
    status: 'open' as const,
    position: 0,
    completion: { kind: 'manual' as const },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person' as const,
    ...change,
  };
  return test.store.plannerItems.insert({ ...base, ...instantsOf(base) });
}

function finish(
  itemId: string,
  completedAt: string,
  by: PlannerOccurrenceRow['completed_by'] = 'person',
): void {
  test.store.plannerOccurrences.save({
    item_id: itemId,
    occurrence_key: 'single',
    status: 'done',
    completed_at: completedAt,
    completed_by: by,
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
}

function task(
  collectionId: string,
  start: string,
  completedAt: string | null,
  by: PlannerOccurrenceRow['completed_by'] = 'person',
): void {
  const created = insert(collectionId, { start_local: start });
  if (completedAt !== null) finish(created.id, completedAt, by);
}

function stats(range: PlannerStatsRange = 'week', profileId = owner.profileId): PlannerStats {
  return composeStats(test.store, { profileId, range, now: NOW, timeZone: 'UTC' });
}

function ring(
  day: string,
  outcome: 'rang' | 'missed',
  dismissedAt: string | null,
  snoozes: number,
): void {
  test.store.plannerRings.insert({
    kind: 'alarm',
    ref_id: ALARM,
    profile_id: owner.profileId,
    due_at: `${day}T06:30:00.000Z`,
    rang_at: outcome === 'rang' ? `${day}T06:30:00.000Z` : null,
    dismissed_at: dismissedAt === null ? null : `${day}T${dismissedAt}:00.000Z`,
    snoozes,
    target: null,
    outcome,
    missed_reason: outcome === 'missed' ? 'hub_down' : null,
  });
}

function timer(label: string | null, endsAt: string, state: 'done' | 'cancelled'): void {
  test.store.plannerTimers.insert({
    profile_id: owner.profileId,
    label,
    duration_ms: 300_000,
    state,
    ends_at: endsAt,
    remaining_ms: null,
    targets: [],
  });
}

beforeEach(async () => {
  test = await testStore(() => new Date(NOW_TEXT));
  owner = addPerson(test, 'Owner', 'owner');
  member = addPerson(test, 'Member', 'member');
  work = collection(owner.profileId, 'calendar', 'Work');
  home = collection(owner.profileId, 'list', 'Home');
  errands = collection(owner.profileId, 'list', 'Errands');
  task(home, '2026-11-04T09:00', '2026-11-04T07:00:00.000Z');
  task(home, '2026-11-05T09:00', '2026-11-05T08:30:00.000Z');
  task(home, '2026-11-05T10:00', '2026-11-05T12:00:00.000Z', 'signal');
  task(home, '2026-11-06T09:00', '2026-11-06T09:00:00.000Z');
  task(home, '2026-11-06T10:00', null);
  task(home, '2026-11-07T08:00', '2026-11-07T08:15:00.000Z');
  task(home, '2026-11-07T20:00', null);
  task(errands, '2026-11-03T09:00', null);
  task(errands, '2026-10-20T09:00', '2026-10-20T09:00:00.000Z');
  insert(work, {
    kind: 'event',
    start_local: '2026-11-06T09:00',
    end_local: '2026-11-06T11:00',
  });
  insert(work, {
    kind: 'event',
    start_local: '2026-11-02T23:00',
    end_local: '2026-11-03T01:00',
  });
  ring('2026-11-05', 'rang', '06:30', 1);
  ring('2026-11-06', 'rang', '06:50', 2);
  ring('2026-11-07', 'missed', null, 0);
  timer('Tea', '2026-11-06T08:00:00.000Z', 'done');
  timer('Tea', '2026-11-06T09:00:00.000Z', 'done');
  timer(null, '2026-11-07T08:00:00.000Z', 'done');
  timer('Tea', '2026-11-07T09:00:00.000Z', 'cancelled');
  timer('Old', '2026-10-01T09:00:00.000Z', 'done');
});

afterEach(async () => {
  await test.close();
});

describe('planner stats', () => {
  it('counts completion, on time and device share over the week', () => {
    const week = stats();
    expect(week).toMatchObject({ range: 'week', from: '2026-11-01', to: '2026-11-07' });
    expect(week.completion).toEqual({ done: 5, due: 7 });
    expect(week.on_time).toEqual({ on_time: 3, late: 2 });
    expect(week.device_share).toEqual({ by_device: 1, by_hand: 4 });
  });

  it('keeps the streak through an incomplete day today and resets on a past one', () => {
    expect(stats().streaks).toEqual({ current: 1, longest: 2 });
  });

  it('lists the completion hours of all twenty four hours', () => {
    const { best_hours: hours } = stats();
    expect(hours).toHaveLength(24);
    expect(hours.filter((entry) => entry.done > 0)).toEqual([
      { hour: 7, done: 1 },
      { hour: 8, done: 2 },
      { hour: 9, done: 1 },
      { hour: 12, done: 1 },
    ]);
  });

  it('books event minutes per calendar and per day across midnight', () => {
    const week = stats();
    expect(week.time_by_calendar).toEqual([{ collection_id: work, minutes: 240 }]);
    const load = new Map(week.weekly_load.map((day) => [day.day, day]));
    expect(load.get('2026-11-02')).toMatchObject({ scheduled_minutes: 60, items: 1 });
    expect(load.get('2026-11-03')).toMatchObject({ scheduled_minutes: 60 });
    expect(load.get('2026-11-06')).toMatchObject({ scheduled_minutes: 120, items: 3 });
    expect(week.weekly_load).toHaveLength(7);
  });

  it('gives each list a daily completion trend', () => {
    const trends = new Map(stats().list_trends.map((list) => [list.collection_id, list.points]));
    const homePoints = trends.get(home);
    expect(homePoints).toHaveLength(7);
    expect(homePoints?.find((point) => point.day === '2026-11-05')).toEqual({
      day: '2026-11-05',
      done: 2,
      due: 2,
    });
    expect(homePoints?.find((point) => point.day === '2026-11-06')).toEqual({
      day: '2026-11-06',
      done: 1,
      due: 2,
    });
    expect(trends.get(errands)?.find((point) => point.day === '2026-11-03')).toEqual({
      day: '2026-11-03',
      done: 0,
      due: 1,
    });
  });

  it('groups finished timers by day and label and ignores cancelled ones', () => {
    expect(stats().timer_use).toEqual([
      { day: '2026-11-06', label: 'Tea', count: 2, total_ms: 600_000 },
      { day: '2026-11-07', label: null, count: 1, total_ms: 300_000 },
    ]);
  });

  it('measures alarm consistency, snoozes and missed rings', () => {
    expect(stats().alarms).toEqual([
      {
        alarm_id: ALARM,
        rang: 2,
        missed: 1,
        snoozes: 3,
        average_minute: 400,
        spread_minutes: 10,
      },
    ]);
  });

  it('widens the range to the month and the year', () => {
    const month = stats('month');
    expect(month).toMatchObject({ from: '2026-10-09', to: '2026-11-07' });
    expect(month.completion).toEqual({ done: 6, due: 8 });
    expect(month.weekly_load).toHaveLength(30);
    const year = stats('year');
    expect(year.weekly_load).toHaveLength(365);
    expect(year.timer_use.at(0)).toMatchObject({ day: '2026-10-01', label: 'Old' });
    expect(PLANNER_STATS.safeParse(year).success).toBe(true);
  });

  it('counts only the asked person', () => {
    const other = collection(member.profileId, 'list', 'Mine');
    insert(other, { start_local: '2026-11-06T09:00' }, member.profileId);
    expect(stats('week', member.profileId).completion).toEqual({ done: 0, due: 1 });
    expect(stats().completion).toEqual({ done: 5, due: 7 });
  });

  it('reads the days of the asked time zone', () => {
    const berlin = composeStats(test.store, {
      profileId: owner.profileId,
      range: 'week',
      now: Temporal.Instant.from('2026-11-07T23:30:00.000Z'),
      timeZone: 'Europe/Berlin',
    });
    expect(berlin).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('counts a skipped task as neither done nor due', () => {
    const skipped = insert(home, { start_local: '2026-11-06T12:00' });
    test.store.plannerOccurrences.save({
      item_id: skipped.id,
      occurrence_key: 'single',
      status: 'skipped',
      completed_at: null,
      completed_by: null,
      evidence: null,
      moved_start: null,
      moved_end: null,
    });
    expect(stats().completion).toEqual({ done: 5, due: 7 });
  });
});
