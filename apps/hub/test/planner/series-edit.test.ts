import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeRange } from '../../src/planner/range';
import type { Caller } from '../../src/server/auth';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-03-20T08:00:00.000Z');

let test: TestStore;
let ann: TestPerson;
let items: ReturnType<typeof plannerItemRoutes>;
let collectionId: string;

const caller = (): Caller => ({ kind: 'client', client: ann.client });

const call = (
  route: Bound,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    caller(),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const create = async (extra: object): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.createPlannerItem, {
      body: {
        collection_id: collectionId,
        kind: 'event',
        title: 'Practice',
        start_local: '2026-03-27T22:00',
        end_local: '2026-03-27T23:00',
        time_zone: 'Europe/Berlin',
        rrule: 'FREQ=DAILY',
        ...extra,
      },
    }),
  );

const patch = async (
  item: PlannerItemRow,
  scope: string,
  key: string | undefined,
  changes: object,
): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(
    await call(items.updatePlannerItem, {
      params: { itemId: item.id },
      body: { scope, ...(key === undefined ? {} : { occurrence_key: key }), changes },
    }),
  );

const remove = (item: PlannerItemRow, scope: string, key: string | undefined): Promise<unknown> =>
  call(items.deletePlannerItem, {
    params: { itemId: item.id },
    query: { scope, ...(key === undefined ? {} : { occurrence_key: key }) },
  });

const view = (from: string, to: string): { title: string; start: string | null }[] =>
  composeRange(test.store, {
    profileId: ann.profileId,
    window: {
      from: Temporal.Instant.from(from),
      to: Temporal.Instant.from(to),
      timeZone: 'Europe/Berlin',
    },
    now: Temporal.Instant.from(NOW.toISOString()),
  }).occurrences.map((occurrence) => ({ title: occurrence.title, start: occurrence.start }));

const WINDOW = ['2026-03-27T00:00:00Z', '2026-04-02T00:00:00Z'] as const;
const starts = (rows: { start: string | null }[]): (string | null)[] =>
  rows.map((row) => row.start);

const DAILY = [
  '2026-03-27T21:00:00.000Z',
  '2026-03-28T21:00:00.000Z',
  '2026-03-29T20:00:00.000Z',
  '2026-03-30T20:00:00.000Z',
  '2026-03-31T20:00:00.000Z',
  '2026-04-01T20:00:00.000Z',
];

beforeEach(async () => {
  test = await testStore(() => NOW);
  ann = addPerson(test, 'Ann', 'member');
  items = plannerItemRoutes({ store: test.store }, () => NOW);
  const collections = plannerCollectionRoutes({ store: test.store });
  collectionId = PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, {
      body: { kind: 'calendar', name: 'Work', colour: 'work', icon: 'briefcase' },
    }),
  ).id;
});

afterEach(async () => {
  await test.close();
});

describe('this occurrence', () => {
  it('writes one override across a DST change and keeps the rest of the series', async () => {
    const master = await create({});
    const override = await patch(master, 'this', '2026-03-30T20:00:00.000Z', {
      title: 'Late practice',
      start_local: '2026-03-30T23:00',
    });
    expect(override).toMatchObject({
      series_id: master.id,
      original_start: '2026-03-30T22:00:00',
      rrule: null,
      start_local: '2026-03-30T23:00',
      end_local: '2026-03-31T00:00:00',
      start: '2026-03-30T21:00:00.000Z',
    });
    const rows = view(...WINDOW);
    expect(rows).toHaveLength(6);
    expect(starts(rows)).toEqual([
      DAILY[0],
      DAILY[1],
      DAILY[2],
      '2026-03-30T21:00:00.000Z',
      DAILY[4],
      DAILY[5],
    ]);
    expect(rows[3]?.title).toBe('Late practice');
    expect(rows[2]?.title).toBe('Practice');
  });

  it('edits the occurrence on the DST day itself', async () => {
    const master = await create({});
    const override = await patch(master, 'this', '2026-03-29T20:00:00.000Z', { title: 'Shifted' });
    expect(override).toMatchObject({
      original_start: '2026-03-29T22:00:00',
      start: '2026-03-29T20:00:00.000Z',
      end: '2026-03-29T21:00:00.000Z',
    });
    expect(starts(view(...WINDOW))).toEqual(DAILY);
  });

  it('updates the same override on a second edit and from the override itself', async () => {
    const master = await create({});
    const first = await patch(master, 'this', '2026-03-30T20:00:00.000Z', { title: 'One' });
    const second = await patch(master, 'this', '2026-03-30T20:00:00.000Z', { title: 'Two' });
    const third = await patch(first, 'this', '2026-03-30T20:00:00.000Z', { title: 'Three' });
    expect([second.id, third.id]).toEqual([first.id, first.id]);
    expect(test.store.plannerItems.overrides(master.id, ann.profileId)).toHaveLength(1);
    expect(view(...WINDOW)[3]?.title).toBe('Three');
  });

  it('moves a completion onto the override', async () => {
    const master = await create({});
    const key = '2026-03-30T20:00:00.000Z';
    await call(items.completePlannerItem, {
      params: { itemId: master.id },
      body: { occurrence_key: key },
    });
    const override = await patch(master, 'this', key, { title: 'Done one' });
    expect(test.store.plannerOccurrences.find(master.id, key)).toBeUndefined();
    expect(test.store.plannerOccurrences.find(override.id, 'single')?.status).toBe('done');
  });

  it('refuses a key that is not an occurrence and an item that does not repeat', async () => {
    const master = await create({});
    await expect(
      patch(master, 'this', '2026-03-30T20:30:00.000Z', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const single = await create({ rrule: null });
    await expect(
      patch(single, 'this', '2026-03-30T20:00:00.000Z', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('this and the following occurrences', () => {
  it('splits across a DST change, ends the old master and starts a new one', async () => {
    const master = await create({});
    const created = await patch(master, 'following', '2026-03-30T20:00:00.000Z', {
      title: 'Evening',
      start_local: '2026-03-30T21:00',
    });
    expect(created).toMatchObject({
      title: 'Evening',
      start_local: '2026-03-30T21:00',
      end_local: '2026-03-30T22:00:00',
      series_id: null,
      rrule: 'FREQ=DAILY',
    });
    expect(created.id).not.toBe(master.id);
    const old = test.store.plannerItems.byId(master.id, ann.profileId);
    expect(old.rrule).toBe('FREQ=DAILY;UNTIL=20260330T195959Z');
    expect(old.series_end).toBe('2026-03-30T20:59:59.000Z');
    const rows = view(...WINDOW);
    expect(starts(rows)).toEqual([
      DAILY[0],
      DAILY[1],
      DAILY[2],
      '2026-03-30T19:00:00.000Z',
      '2026-03-31T19:00:00.000Z',
      '2026-04-01T19:00:00.000Z',
    ]);
    expect(rows.map((row) => row.title)).toEqual([
      'Practice',
      'Practice',
      'Practice',
      'Evening',
      'Evening',
      'Evening',
    ]);
  });

  it('splits on the DST day without moving any other occurrence', async () => {
    const master = await create({});
    await patch(master, 'following', '2026-03-29T20:00:00.000Z', { title: 'Renamed' });
    const rows = view(...WINDOW);
    expect(starts(rows)).toEqual(DAILY);
    expect(rows.map((row) => row.title)).toEqual([
      'Practice',
      'Practice',
      'Renamed',
      'Renamed',
      'Renamed',
      'Renamed',
    ]);
  });

  it('carries the remaining count to the new master', async () => {
    const master = await create({ rrule: 'FREQ=DAILY;COUNT=5' });
    const created = await patch(master, 'following', '2026-03-29T20:00:00.000Z', {
      title: 'Tail',
    });
    expect(created.rrule).toBe('FREQ=DAILY;COUNT=3');
    expect(view(...WINDOW)).toHaveLength(5);
  });

  it('splits an all-day series on its date', async () => {
    const master = await create({
      start_local: '2026-03-27',
      end_local: null,
      time_zone: null,
      all_day: true,
      rrule: 'FREQ=DAILY',
    });
    const created = await patch(master, 'following', '2026-03-30', { title: 'Away' });
    const old = test.store.plannerItems.byId(master.id, ann.profileId);
    expect(old.rrule).toBe('FREQ=DAILY;UNTIL=20260329');
    expect(created).toMatchObject({ start_local: '2026-03-30', rrule: 'FREQ=DAILY' });
    expect(view(...WINDOW).map((row) => row.title)).toEqual([
      'Practice',
      'Practice',
      'Practice',
      'Away',
      'Away',
      'Away',
      'Away',
    ]);
  });

  it('keeps later overrides and exclusions on the new master when the times do not change', async () => {
    const master = await create({});
    const override = await patch(master, 'this', '2026-03-31T20:00:00.000Z', { title: 'Special' });
    await remove(master, 'this', '2026-04-01T20:00:00.000Z');
    const created = await patch(master, 'following', '2026-03-30T20:00:00.000Z', {
      title: 'Tail',
    });
    expect(test.store.plannerItems.byId(override.id, ann.profileId).series_id).toBe(created.id);
    expect(created.exdates).toEqual(['2026-04-01T22:00:00']);
    expect(test.store.plannerItems.byId(master.id, ann.profileId).exdates).toEqual([]);
    expect(view(...WINDOW).map((row) => row.title)).toEqual([
      'Practice',
      'Practice',
      'Practice',
      'Tail',
      'Special',
    ]);
  });

  it('drops later overrides when the new series changes its times', async () => {
    const master = await create({});
    const override = await patch(master, 'this', '2026-03-31T20:00:00.000Z', { title: 'Special' });
    await patch(master, 'following', '2026-03-30T20:00:00.000Z', {
      start_local: '2026-03-30T18:00',
    });
    expect(test.store.plannerItems.find(override.id, ann.profileId)).toBeUndefined();
    expect(view(...WINDOW).map((row) => row.title)).not.toContain('Special');
  });

  it('changes the whole series when the first occurrence is the start', async () => {
    const master = await create({});
    const same = await patch(master, 'following', '2026-03-27T21:00:00.000Z', { title: 'All' });
    expect(same.id).toBe(master.id);
    expect(same.title).toBe('All');
  });
});

describe('deleting', () => {
  it('excludes one occurrence across a DST change', async () => {
    const master = await create({});
    await remove(master, 'this', '2026-03-29T20:00:00.000Z');
    const stored = test.store.plannerItems.byId(master.id, ann.profileId);
    expect(stored.exdates).toEqual(['2026-03-29T22:00:00']);
    expect(starts(view(...WINDOW))).toEqual([DAILY[0], DAILY[1], DAILY[3], DAILY[4], DAILY[5]]);
  });

  it('removes the override of an excluded occurrence', async () => {
    const master = await create({});
    const override = await patch(master, 'this', '2026-03-30T20:00:00.000Z', { title: 'Gone' });
    await remove(override, 'all', undefined);
    expect(test.store.plannerItems.find(override.id, ann.profileId)).toBeUndefined();
    expect(test.store.plannerItems.byId(master.id, ann.profileId).exdates).toEqual([
      '2026-03-30T22:00:00',
    ]);
    expect(view(...WINDOW)).toHaveLength(5);
  });

  it('ends the series before this occurrence', async () => {
    const master = await create({});
    await remove(master, 'following', '2026-03-30T20:00:00.000Z');
    const stored = test.store.plannerItems.byId(master.id, ann.profileId);
    expect(stored.rrule).toBe('FREQ=DAILY;UNTIL=20260330T195959Z');
    expect(starts(view(...WINDOW))).toEqual(DAILY.slice(0, 3));
  });

  it('removes the whole series when the first occurrence is the start', async () => {
    const master = await create({});
    await remove(master, 'following', '2026-03-27T21:00:00.000Z');
    expect(test.store.plannerItems.find(master.id, ann.profileId)).toBeUndefined();
  });
});
