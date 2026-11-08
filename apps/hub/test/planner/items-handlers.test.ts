import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_ROW,
  PLANNER_PREFERENCES,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import { plannerPreferenceRoutes } from '../../src/server/handlers/planner-preferences';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T08:00:00.000Z');

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let items: ReturnType<typeof plannerItemRoutes>;
let collections: ReturnType<typeof plannerCollectionRoutes>;
let preferences: ReturnType<typeof plannerPreferenceRoutes>;
let changedPreferences: string[];

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const item = async (person: TestPerson, raw: object, query: object = {}): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(await call(items.createPlannerItem, person, { query, body: raw }));

const calendar = async (person: TestPerson, name = 'Work'): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, person, {
      body: { kind: 'calendar', name, colour: 'work', icon: 'briefcase' },
    }),
  );

const timed = (collectionId: string, extra: object = {}): object => ({
  collection_id: collectionId,
  kind: 'event',
  title: 'Dentist',
  start_local: '2026-03-28T22:00',
  end_local: '2026-03-29T01:00',
  time_zone: 'Europe/Berlin',
  ...extra,
});

beforeEach(async () => {
  test = await testStore(() => NOW);
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  const context = { store: test.store };
  items = plannerItemRoutes(context, () => NOW);
  collections = plannerCollectionRoutes(context);
  changedPreferences = [];
  preferences = plannerPreferenceRoutes(context, (profileId) => {
    changedPreferences.push(profileId);
  });
});

afterEach(async () => {
  await test.close();
});

describe('creating items', () => {
  it('derives the instants from the wall time and its zone across a DST change', async () => {
    const work = await calendar(ann);
    const created = await item(ann, timed(work.id));
    expect(created).toMatchObject({
      start: '2026-03-28T21:00:00.000Z',
      end: '2026-03-29T00:00:00.000Z',
      series_end: null,
      status: 'open',
      created_by: 'person',
      profile_id: ann.profileId,
    });
    const gap = await item(
      ann,
      timed(work.id, { start_local: '2026-03-29T02:30', end_local: null }),
    );
    expect(gap.start).toBe('2026-03-29T01:30:00.000Z');
  });

  it('keeps an all-day item on its date without a zone', async () => {
    const work = await calendar(ann);
    const created = await item(ann, {
      collection_id: work.id,
      kind: 'event',
      title: 'Holiday',
      start_local: '2026-12-24',
      all_day: true,
    });
    expect(created).toMatchObject({ start_local: '2026-12-24', time_zone: null, all_day: true });
    expect(created.start).toBe('2026-12-24T00:00:00.000Z');
  });

  it('ends a series at its UNTIL plus the event length and leaves an open series open', async () => {
    const work = await calendar(ann);
    const finite = await item(
      ann,
      timed(work.id, {
        start_local: '2026-11-02T09:00',
        end_local: '2026-11-02T10:00',
        rrule: 'FREQ=DAILY;UNTIL=20261110T090000Z',
      }),
    );
    expect(finite.series_end).toBe('2026-11-10T10:00:00.000Z');
    const open = await item(
      ann,
      timed(work.id, {
        start_local: '2026-11-02T09:00',
        end_local: null,
        rrule: 'FREQ=WEEKLY',
      }),
    );
    expect(open.series_end).toBeNull();
  });

  it('appends after the last position of the collection', async () => {
    const work = await calendar(ann);
    const first = await item(ann, timed(work.id));
    const second = await item(ann, timed(work.id));
    expect(second.position).toBe(first.position + 1);
  });

  it('rejects a timed item without a zone and an all-day item with one', async () => {
    const work = await calendar(ann);
    await expect(
      call(items.createPlannerItem, ann, { body: timed(work.id, { time_zone: null }) }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      call(items.createPlannerItem, ann, { body: timed(work.id, { all_day: true }) }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses a calendar that belongs to another person', async () => {
    const bobs = await calendar(bob, 'Bob work');
    await expect(
      call(items.createPlannerItem, ann, { body: timed(bobs.id) }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
  });
});

describe('member scope', () => {
  it('lets a member work only on their own planner', async () => {
    const work = await calendar(ann);
    const mine = await item(ann, timed(work.id));
    await expect(
      call(items.deletePlannerItem, bob, { params: { itemId: mine.id } }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
    await expect(
      call(items.createPlannerItem, ann, {
        query: { personId: bob.profileId },
        body: timed(work.id),
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('lets the owner act for a person', async () => {
    const work = await calendar(ann);
    const made = await item(owner, timed(work.id), { personId: ann.profileId });
    expect(made.profile_id).toBe(ann.profileId);
    expect(test.store.plannerItems.find(made.id, owner.profileId)).toBeUndefined();
  });
});

describe('changing and deleting items', () => {
  it('recomputes the instants when the whole item changes', async () => {
    const work = await calendar(ann);
    const created = await item(ann, timed(work.id));
    const changed = PLANNER_ITEM_ROW.parse(
      await call(items.updatePlannerItem, ann, {
        params: { itemId: created.id },
        body: { changes: { start_local: '2026-03-29T12:00', end_local: null, title: 'Moved' } },
      }),
    );
    expect(changed).toMatchObject({ title: 'Moved', start: '2026-03-29T10:00:00.000Z', end: null });
  });

  it('deletes an item with its occurrences', async () => {
    const work = await calendar(ann);
    const created = await item(ann, {
      collection_id: work.id,
      kind: 'task',
      title: 'Pay rent',
    });
    await call(items.completePlannerItem, ann, { params: { itemId: created.id }, body: {} });
    await call(items.deletePlannerItem, ann, { params: { itemId: created.id } });
    expect(test.store.plannerItems.find(created.id, ann.profileId)).toBeUndefined();
    expect(test.store.plannerOccurrences.find(created.id, 'single')).toBeUndefined();
  });
});

describe('completing, skipping and moving', () => {
  const task = async (person: TestPerson, extra: object = {}): Promise<PlannerItemRow> => {
    const list = await calendar(person, 'Tasks');
    return item(person, { collection_id: list.id, kind: 'task', title: 'Brush teeth', ...extra });
  };

  it('completes a task once and marks the item done', async () => {
    const created = await task(ann);
    const done = PLANNER_OCCURRENCE_ROW.parse(
      await call(items.completePlannerItem, ann, {
        params: { itemId: created.id },
        body: {
          evidence: { source: 'oral-b', deviceId: null, summary: 'Brushed 2:00', sessionId: null },
        },
      }),
    );
    expect(done).toMatchObject({
      status: 'done',
      completed_at: NOW.toISOString(),
      completed_by: 'ai',
    });
    expect(test.store.plannerItems.byId(created.id, ann.profileId).status).toBe('done');
    const again = await call(items.completePlannerItem, ann, {
      params: { itemId: created.id },
      body: {},
    });
    expect(again).toStrictEqual(done);
  });

  it('needs the occurrence of a repeating item and rejects one for a single item', async () => {
    const single = await task(ann);
    await expect(
      call(items.completePlannerItem, ann, {
        params: { itemId: single.id },
        body: { occurrence_key: '2026-11-08T07:30:00Z' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const list = await calendar(ann, 'Habits');
    const repeating = await item(
      ann,
      timed(list.id, {
        kind: 'task',
        start_local: '2026-11-07T07:30',
        end_local: null,
        rrule: 'FREQ=DAILY',
      }),
    );
    await expect(
      call(items.completePlannerItem, ann, { params: { itemId: repeating.id }, body: {} }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const key = '2026-11-08T06:30:00Z';
    await call(items.completePlannerItem, ann, {
      params: { itemId: repeating.id },
      body: { occurrence_key: key },
    });
    expect(test.store.plannerItems.byId(repeating.id, ann.profileId).status).toBe('open');
    expect(test.store.plannerOccurrences.byKey(repeating.id, key).status).toBe('done');
  });

  it('skips, refuses to skip a done occurrence and moves a missed one', async () => {
    const skipped = await task(ann);
    expect(
      await call(items.skipPlannerItem, ann, { params: { itemId: skipped.id }, body: {} }),
    ).toMatchObject({ status: 'skipped' });
    await expect(
      call(items.completePlannerItem, ann, { params: { itemId: skipped.id }, body: {} }),
    ).rejects.toMatchObject({ code: 'conflict' });
    const later = await task(ann, { title: 'Call mum' });
    expect(
      await call(items.movePlannerItem, ann, {
        params: { itemId: later.id },
        body: { start: '2026-11-07T15:00:00Z' },
      }),
    ).toMatchObject({ status: 'missed', moved_start: '2026-11-07T15:00:00Z', moved_end: null });
  });
});

describe('collections', () => {
  it('creates, changes and deletes a collection with its items', async () => {
    const work = await calendar(ann);
    expect(work).toMatchObject({
      source: 'local',
      google: null,
      visible: true,
      profile_id: ann.profileId,
    });
    const renamed = PLANNER_COLLECTION_ROW.parse(
      await call(collections.updatePlannerCollection, ann, {
        params: { collectionId: work.id },
        body: { name: 'Office', visible: false },
      }),
    );
    expect(renamed).toMatchObject({ name: 'Office', visible: false });
    const inside = await item(ann, timed(work.id));
    await call(collections.deletePlannerCollection, ann, { params: { collectionId: work.id } });
    expect(test.store.plannerItems.find(inside.id, ann.profileId)).toBeUndefined();
    await expect(
      call(collections.deletePlannerCollection, bob, { params: { collectionId: work.id } }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
  });

  it('keeps another person collections out of reach', async () => {
    const bobs = await calendar(bob);
    await expect(
      call(collections.updatePlannerCollection, ann, {
        params: { collectionId: bobs.id },
        body: { name: 'Mine now' },
      }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
  });
});

describe('preferences', () => {
  it('answers the defaults until saved, then each person their own', async () => {
    const defaults = PLANNER_PREFERENCES.parse(await call(preferences.readPlannerPreferences, ann));
    expect(defaults.clock.snooze_minutes).toBe(9);
    const saved = PLANNER_PREFERENCES.parse(
      await call(preferences.writePlannerPreferences, ann, {
        body: { ...defaults, watch: { watch_alarm_sync: false, watch_calendar_push: true } },
      }),
    );
    expect(saved.watch.watch_alarm_sync).toBe(false);
    const mine = PLANNER_PREFERENCES.parse(await call(preferences.readPlannerPreferences, ann));
    const his = PLANNER_PREFERENCES.parse(await call(preferences.readPlannerPreferences, bob));
    expect(mine.watch.watch_alarm_sync).toBe(false);
    expect(his.watch.watch_alarm_sync).toBe(true);
    expect(changedPreferences).toEqual([ann.profileId]);
  });

  it('keeps a member out of another person settings and refuses a foreign default list', async () => {
    await expect(
      call(preferences.readPlannerPreferences, ann, { query: { personId: bob.profileId } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const defaults = PLANNER_PREFERENCES.parse(
      await call(preferences.readPlannerPreferences, owner),
    );
    const bobs = await calendar(bob);
    await expect(
      call(preferences.writePlannerPreferences, ann, {
        body: { ...defaults, tasks: { ...defaults.tasks, default_collection_id: bobs.id } },
      }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
    expect(changedPreferences).toEqual([]);
  });
});
