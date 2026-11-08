import { DatabaseSync } from 'node:sqlite';
import type { LiveChange } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  PlannerCollectionsRepository,
  type PlannerCollectionInput,
} from '../../src/store/repositories/planner-collections';
import {
  PlannerItemsRepository,
  type PlannerItemInput,
} from '../../src/store/repositories/planner-items';
import { PlannerOccurrencesRepository } from '../../src/store/repositories/planner-occurrences';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-07T08:00:00.000Z';
const DEVICE = '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f';

let collections: PlannerCollectionsRepository;
let items: PlannerItemsRepository;
let occurrences: PlannerOccurrencesRepository;
const changes: LiveChange[] = [];
let ann: string, bob: string, work: string, bobWork: string;

function collectionInput(profileId: string, name: string): PlannerCollectionInput {
  return {
    profile_id: profileId,
    kind: 'calendar',
    name,
    colour: 'work',
    icon: 'briefcase',
    position: 1,
    visible: true,
    default_reminders: [{ minutes_before: 10 }],
    source: 'local',
    google: null,
  };
}

function timed(
  profileId: string,
  collectionId: string,
  start: string,
  end: string,
): PlannerItemInput {
  return {
    profile_id: profileId,
    collection_id: collectionId,
    kind: 'event',
    parent_id: null,
    title: 'Dentist',
    notes: '',
    location: null,
    priority: null,
    tags: ['health'],
    estimate_minutes: null,
    start_local: start.slice(0, 16),
    end_local: end.slice(0, 16),
    time_zone: 'UTC',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start,
    end,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [{ minutes_before: 5 }],
    google: null,
    created_by: 'person',
  };
}

function weekly(
  profileId: string,
  collectionId: string,
  start: string,
  seriesEnd: string | null,
): PlannerItemInput {
  return {
    ...timed(profileId, collectionId, start, start),
    title: 'Run',
    rrule: 'FREQ=WEEKLY',
    series_end: seriesEnd,
  };
}

const titles = (rows: readonly { readonly title: string }[]): string[] =>
  rows.map((row) => row.title).sort();

beforeEach(() => {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const feed = new ChangeFeed(testLogger('store'));
  feed.subscribe((change) => changes.push(change));
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  const profiles = new ProfilesRepository(context);
  ann = profiles.create({ name: 'Ann' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  occurrences = new PlannerOccurrencesRepository(context);
  items = new PlannerItemsRepository(context, occurrences);
  collections = new PlannerCollectionsRepository(context, items);
  work = collections.insert(collectionInput(ann, 'Work')).id;
  bobWork = collections.insert(collectionInput(bob, 'Work')).id;
  changes.length = 0;
});

describe('planner items', () => {
  it('stores an item with its JSON fields and announces the insert', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    expect(items.byId(row.id, ann)).toEqual(row);
    expect(row.tags).toEqual(['health']);
    expect(row.reminders).toEqual([{ minutes_before: 5 }]);
    expect(row.completion).toEqual({ kind: 'manual' });
    expect(changes.map((change) => [change.table, change.operation])).toEqual([
      ['planner_items', 'INSERT'],
    ]);
  });

  it('keeps one person from reading or changing another person item', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    expect(items.find(row.id, bob)).toBeUndefined();
    expect(() => items.update(row.id, bob, { title: 'Mine' })).toThrow();
    expect(items.list(bob)).toEqual([]);
  });

  it('refuses an item whose collection belongs to nobody', () => {
    const input = timed(ann, DEVICE, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z');
    expect(() => items.insert(input)).toThrow(StoreConflictError);
  });

  it('reads a range by the derived instants for items and series', () => {
    items.insert({
      ...timed(ann, work, '2026-11-10T09:00:00.000Z', '2026-11-10T10:00:00.000Z'),
      title: 'inside',
    });
    items.insert({
      ...timed(ann, work, '2026-11-01T09:00:00.000Z', '2026-11-01T10:00:00.000Z'),
      title: 'before',
    });
    items.insert({
      ...timed(ann, work, '2026-11-20T09:00:00.000Z', '2026-11-20T10:00:00.000Z'),
      title: 'after',
    });
    items.insert({
      ...timed(ann, work, '2026-11-09T22:00:00.000Z', '2026-11-10T01:00:00.000Z'),
      title: 'spans in',
    });
    items.insert({ ...weekly(ann, work, '2026-10-01T07:00:00.000Z', null), title: 'open series' });
    items.insert({
      ...weekly(ann, work, '2026-10-01T07:00:00.000Z', '2026-11-05T07:00:00.000Z'),
      title: 'ended series',
    });
    items.insert({
      ...weekly(ann, work, '2026-10-01T07:00:00.000Z', '2026-11-12T07:00:00.000Z'),
      title: 'live series',
    });
    items.insert({
      ...weekly(ann, work, '2026-12-01T07:00:00.000Z', null),
      title: 'future series',
    });
    items.insert({
      ...timed(bob, bobWork, '2026-11-10T09:00:00.000Z', '2026-11-10T10:00:00.000Z'),
      title: 'bob',
    });
    const found = items.range(ann, {
      from: '2026-11-10T00:00:00.000Z',
      to: '2026-11-11T00:00:00.000Z',
    });
    expect(titles(found)).toEqual(['inside', 'live series', 'open series', 'spans in']);
  });

  it('finds undated tasks by filter and tasks by due instant', () => {
    const task: PlannerItemInput = {
      ...timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
      kind: 'task',
      title: 'Pay rent',
      start_local: null,
      end_local: null,
      time_zone: null,
      start: null,
      end: null,
      due_date: '2026-11-12',
      due_at: '2026-11-12T10:00:00.000Z',
    };
    const row = items.insert(task);
    items.insert(timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'));
    expect(items.list(ann, { kind: 'task' }).map((item) => item.id)).toEqual([row.id]);
    expect(items.list(ann, { statuses: ['done'] })).toEqual([]);
    expect(items.list(ann, { collectionIds: [work], statuses: ['open'] })).toHaveLength(2);
    expect(
      items.due(ann, { from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' }),
    ).toEqual([row]);
    expect(
      items.range(ann, { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' }),
    ).toHaveLength(1);
  });

  it('validates a change as a whole and announces the old and new row', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    changes.length = 0;
    const after = items.update(row.id, ann, { title: 'Checkup', tags: [] });
    expect(after.title).toBe('Checkup');
    expect(items.byId(row.id, ann).tags).toEqual([]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      operation: 'UPDATE',
      record: { title: 'Checkup' },
      oldRecord: { title: 'Dentist' },
    });
    expect(() => items.update(row.id, ann, { end_local: '2026-11-09T13:00' })).toThrow();
    expect(items.byId(row.id, ann).title).toBe('Checkup');
  });

  it('trashes an item out of every read but keeps it for the sync', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    items.trash(row.id, ann);
    expect(items.find(row.id, ann)).toBeUndefined();
    expect(items.list(ann)).toEqual([]);
    expect(
      items.range(ann, { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' }),
    ).toEqual([]);
    expect(items.trashed(ann).map((item) => item.id)).toEqual([row.id]);
  });

  it('finds the rows of one Google event and its changed occurrences', () => {
    const google = {
      id: 'g1',
      calendarOrListId: 'cal',
      etag: null,
      base: {},
      state: 'synced',
    } as const;
    const master = items.insert({ ...weekly(ann, work, '2026-11-02T07:00:00.000Z', null), google });
    const override = items.insert({
      ...timed(ann, work, '2026-11-09T08:00:00.000Z', '2026-11-09T09:00:00.000Z'),
      series_id: master.id,
      original_start: '2026-11-09T07:00',
      google: { ...google, id: 'g1_20261109' },
    });
    expect(items.byGoogle(ann, 'cal', 'g1').map((item) => item.id)).toEqual([master.id]);
    expect(items.overrides(master.id, ann).map((item) => item.id)).toEqual([override.id]);
    expect(items.byGoogle(ann, 'other', 'g1')).toEqual([]);
    expect(items.byGoogle(bob, 'cal', 'g1')).toEqual([]);
  });

  it('purges a series with its changed occurrences, children and marks, announcing each', () => {
    const master = items.insert(weekly(ann, work, '2026-11-02T07:00:00.000Z', null));
    const override = items.insert({
      ...timed(ann, work, '2026-11-09T08:00:00.000Z', '2026-11-09T09:00:00.000Z'),
      series_id: master.id,
      original_start: '2026-11-09T07:00',
    });
    const child = items.insert({
      ...timed(ann, work, '2026-11-10T08:00:00.000Z', '2026-11-10T09:00:00.000Z'),
      parent_id: master.id,
    });
    const other = items.insert(
      timed(ann, work, '2026-11-11T08:00:00.000Z', '2026-11-11T09:00:00.000Z'),
    );
    occurrences.save({
      item_id: master.id,
      occurrence_key: '2026-11-02T07:00:00.000Z',
      status: 'skipped',
      completed_at: null,
      completed_by: null,
      evidence: null,
      moved_start: null,
      moved_end: null,
    });
    changes.length = 0;
    items.purge(master.id, ann);
    expect(items.list(ann).map((item) => item.id)).toEqual([other.id]);
    expect(occurrences.forItems([master.id])).toEqual([]);
    const deleted = changes.map((change) => change.operation);
    expect(deleted.every((operation) => operation === 'DELETE')).toBe(true);
    const removed = changes.flatMap((change) =>
      change.oldRecord !== null && 'id' in change.oldRecord ? [change.oldRecord.id] : [],
    );
    expect(removed.sort()).toEqual([master.id, override.id, child.id].sort());
    expect(changes.filter((change) => change.table === 'planner_occurrences')).toHaveLength(1);
  });
});

describe('planner collections', () => {
  it('lists a person own collections in order and changes one', () => {
    const second = collections.insert({
      ...collectionInput(ann, 'Home'),
      position: 0,
      colour: 'home',
    });
    expect(collections.list(ann).map((row) => row.name)).toEqual(['Home', 'Work']);
    expect(collections.list(bob).map((row) => row.name)).toEqual(['Work']);
    const after = collections.update(second.id, ann, { visible: false, default_reminders: [] });
    expect(collections.byId(second.id, ann)).toEqual(after);
    expect(after.visible).toBe(false);
    expect(() => collections.update(second.id, bob, { name: 'x' })).toThrow();
  });

  it('keeps the Google link and the source together', () => {
    const link = { id: 'cal-1', etag: null, syncToken: null };
    expect(() => collections.insert({ ...collectionInput(ann, 'G'), source: 'google' })).toThrow();
    const row = collections.insert({
      ...collectionInput(ann, 'G'),
      source: 'google',
      google: link,
    });
    expect(collections.byGoogle(ann, 'cal-1')).toEqual(row);
    expect(collections.byGoogle(bob, 'cal-1')).toBeUndefined();
  });

  it('removes a collection with its items and announces them', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    changes.length = 0;
    collections.remove(work, ann);
    expect(collections.find(work, ann)).toBeUndefined();
    expect(items.find(row.id, ann)).toBeUndefined();
    expect(changes.map((change) => [change.table, change.operation])).toEqual([
      ['planner_items', 'DELETE'],
      ['planner_collections', 'DELETE'],
    ]);
  });
});

describe('planner occurrences', () => {
  it('saves a done mark with evidence, replaces it and lists completions in a window', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    const done = occurrences.save({
      item_id: row.id,
      occurrence_key: 'single',
      status: 'done',
      completed_at: '2026-11-09T14:30:00.000Z',
      completed_by: 'signal',
      evidence: { source: 'oralb', deviceId: DEVICE, summary: 'Brushed 2 min', sessionId: null },
      moved_start: null,
      moved_end: null,
    });
    expect(occurrences.byKey(row.id, 'single')).toEqual(done);
    expect(changes.at(-1)?.operation).toBe('INSERT');
    const window = { from: '2026-11-09T00:00:00.000Z', to: '2026-11-10T00:00:00.000Z' };
    expect(occurrences.completedBetween(ann, window)).toEqual([done]);
    expect(occurrences.completedBetween(bob, window)).toEqual([]);
    occurrences.save({
      ...done,
      status: 'skipped',
      completed_at: null,
      completed_by: null,
      evidence: null,
    });
    expect(changes.at(-1)?.operation).toBe('UPDATE');
    expect(occurrences.completedBetween(ann, window)).toEqual([]);
    occurrences.remove(row.id, 'single');
    expect(occurrences.find(row.id, 'single')).toBeUndefined();
  });

  it('refuses a done mark without its completer', () => {
    const row = items.insert(
      timed(ann, work, '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z'),
    );
    expect(() =>
      occurrences.save({
        item_id: row.id,
        occurrence_key: 'single',
        status: 'done',
        completed_at: null,
        completed_by: null,
        evidence: null,
        moved_start: null,
        moved_end: null,
      }),
    ).toThrow();
  });
});
