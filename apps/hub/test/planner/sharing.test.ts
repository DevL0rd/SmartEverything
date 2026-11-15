import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeRange } from '../../src/planner/range';
import {
  itemRoleOf,
  visibleCollections,
  writableCollections,
} from '../../src/planner/sharing/visibility';
import type { Caller } from '../../src/server/auth';
import {
  plannerCollectionRoutes,
  plannerItemRoutes,
} from '../../src/server/handlers/planner-items';
import { plannerSharingRoutes } from '../../src/server/handlers/planner-sharing';
import { plannerTablesOf } from '../../src/server/handlers/snapshot';
import { visible, type Hearing } from '../../src/server/live-visibility';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-09T08:00:00.000Z');

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let items: ReturnType<typeof plannerItemRoutes>;
let collections: ReturnType<typeof plannerCollectionRoutes>;
let sharing: ReturnType<typeof plannerSharingRoutes>;

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

const calendar = async (person: TestPerson, name: string): Promise<PlannerCollectionRow> =>
  PLANNER_COLLECTION_ROW.parse(
    await call(collections.createPlannerCollection, person, {
      body: { kind: 'calendar', name, colour: 'work', icon: 'briefcase' },
    }),
  );

const dinner = (collectionId: string, extra: object = {}): object => ({
  collection_id: collectionId,
  kind: 'event',
  title: 'Dinner',
  start_local: '2026-11-09T19:00',
  end_local: '2026-11-09T20:00',
  time_zone: 'UTC',
  ...extra,
});

const create = async (person: TestPerson, body: object): Promise<PlannerItemRow> =>
  PLANNER_ITEM_ROW.parse(await call(items.createPlannerItem, person, { body }));

interface ShareRequest {
  readonly from: TestPerson;
  readonly collectionId: string;
  readonly to: TestPerson;
  readonly role: 'view' | 'edit';
  readonly query?: object;
}

const share = (request: ShareRequest): Promise<unknown> =>
  call(sharing.sharePlannerCollection, request.from, {
    params: { collectionId: request.collectionId, personId: request.to.profileId },
    query: request.query ?? {},
    body: { role: request.role },
  });

const rangeOf = (person: TestPerson): string[] =>
  composeRange(test.store, {
    profileId: person.profileId,
    window: {
      from: Temporal.Instant.from('2026-11-09T00:00:00Z'),
      to: Temporal.Instant.from('2026-11-10T00:00:00Z'),
      timeZone: 'UTC',
    },
    now: Temporal.Instant.from(NOW.toISOString()),
  }).occurrences.map((view) => view.title);

const household = (): PlannerCollectionRow => {
  const [family] = test.store.plannerCollections.household();
  if (family === undefined) throw new Error('The Family calendar is missing.');
  return family;
};

beforeEach(async () => {
  test = await testStore(() => NOW);
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  const context = { store: test.store };
  items = plannerItemRoutes(context, () => NOW);
  collections = plannerCollectionRoutes(context);
  sharing = plannerSharingRoutes(context, () => NOW);
});

afterEach(async () => {
  await test.close();
});

describe('who sees what', () => {
  it('keeps a private calendar private', async () => {
    const mine = await calendar(ann, 'Ann private');
    await create(ann, dinner(mine.id));
    expect(rangeOf(ann)).toEqual(['Dinner']);
    expect(rangeOf(bob)).toEqual([]);
    expect(visibleCollections(test.store, bob.profileId)).toEqual([household()]);
  });

  it('shows a shared calendar to the person it is shared with, with the right role', async () => {
    const mine = await calendar(ann, 'Ann shared');
    await create(ann, dinner(mine.id));
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'view' });
    expect(rangeOf(bob)).toEqual(['Dinner']);
    await expect(create(bob, dinner(mine.id, { title: 'Mine now' }))).rejects.toMatchObject({
      code: 'forbidden',
    });
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'edit' });
    const added = await create(bob, dinner(mine.id, { title: 'Brunch' }));
    expect(added.profile_id).toBe(ann.profileId);
    expect(rangeOf(ann).sort()).toEqual(['Brunch', 'Dinner']);
  });

  it('shows the household calendar to everyone and lets everyone add to it', async () => {
    const family = household();
    await create(bob, dinner(family.id, { title: 'Pizza night' }));
    expect(rangeOf(ann)).toEqual(['Pizza night']);
    expect(rangeOf(owner)).toEqual(['Pizza night']);
    await expect(
      call(collections.deletePlannerCollection, ann, { params: { collectionId: family.id } }),
    ).rejects.toThrow(/no planner collection/);
  });

  it('lets only the owner share and only the owner or the person stop sharing', async () => {
    const mine = await calendar(ann, 'Ann shared');
    await expect(
      share({ from: bob, collectionId: mine.id, to: ann, role: 'view' }),
    ).rejects.toThrow(/no planner collection/);
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'view' });
    await expect(
      call(sharing.unsharePlannerCollection, owner, {
        params: { collectionId: mine.id, personId: bob.profileId },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await call(sharing.unsharePlannerCollection, bob, {
      params: { collectionId: mine.id, personId: bob.profileId },
    });
    expect(test.store.plannerShares.forCollection(mine.id)).toEqual([]);
  });

  it('refuses to share the Family calendar and to share with its owner', async () => {
    const family = household();
    await expect(
      share({
        from: owner,
        collectionId: family.id,
        to: bob,
        role: 'view',
        query: { personId: family.profile_id },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    const mine = await calendar(ann, 'Ann shared');
    await expect(
      share({ from: ann, collectionId: mine.id, to: ann, role: 'view' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('lets the viewer pick colour and visibility of a shared calendar only for themselves', async () => {
    const mine = await calendar(ann, 'Ann shared');
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'view' });
    const changed = await call(sharing.changePlannerShare, bob, {
      params: { collectionId: mine.id, personId: bob.profileId },
      body: { colour: 'health', visible: false },
    });
    expect(changed).toMatchObject({ colour: 'health', visible: false });
    await expect(
      call(sharing.changePlannerShare, ann, {
        params: { collectionId: mine.id, personId: bob.profileId },
        body: { visible: true },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('the snapshot and live changes follow the same rule', () => {
  it('gives a member the shared and household calendars and their items', async () => {
    const mine = await calendar(ann, 'Ann shared');
    const secret = await calendar(ann, 'Ann secret');
    await create(ann, dinner(mine.id));
    await create(ann, dinner(secret.id, { title: 'Secret' }));
    const family = household();
    await create(owner, dinner(family.id, { title: 'Family' }));
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'view' });
    const tables = plannerTablesOf(test.store, { client: bob.client, profileId: bob.profileId });
    expect(tables.planner_collections.map((row) => row.name).sort()).toEqual([
      'Ann shared',
      'Family',
    ]);
    expect(tables.planner_items.map((row) => row.title).sort()).toEqual(['Dinner', 'Family']);
    expect(tables.planner_collection_shares).toHaveLength(1);
  });

  it('delivers a shared item change to the person it is shared with only', async () => {
    const mine = await calendar(ann, 'Ann shared');
    await share({ from: ann, collectionId: mine.id, to: bob, role: 'view' });
    const seen: Record<string, boolean> = {};
    const unsubscribe = test.store.feed.subscribe((change) => {
      if (change.table !== 'planner_items') return;
      const hearing = (person: TestPerson): Hearing => ({
        client: person.client,
        tables: new Set(['planner_items']),
      });
      seen['ann'] = visible(hearing(ann), change, test.store);
      seen['bob'] = visible(hearing(bob), change, test.store);
      seen['owner'] = visible(hearing(owner), change, test.store);
    });
    const secret = await calendar(ann, 'Ann secret');
    await create(ann, dinner(mine.id));
    expect(seen).toEqual({ ann: true, bob: true, owner: true });
    await create(ann, dinner(secret.id));
    expect(seen).toEqual({ ann: true, bob: false, owner: true });
    unsubscribe();
  });
});

describe('feed calendars', () => {
  const feedCalendar = (): PlannerCollectionRow =>
    test.store.plannerCollections.insert({
      profile_id: owner.profileId,
      kind: 'calendar',
      name: 'Holidays',
      colour: 'personal',
      icon: 'calendar',
      position: 90,
      visible: true,
      default_reminders: [],
      audience: 'household',
      source: 'feed',
      google: null,
      feed: { kind: 'holidays', country: 'DE', state: null },
    });

  const feedItem = async (collection: PlannerCollectionRow): Promise<PlannerItemRow> => {
    const own = await calendar(owner, 'Scratch');
    const made = await create(owner, dinner(own.id));
    const { id: _id, created_at: _created, updated_at: _updated, ...rest } = made;
    return test.store.plannerItems.insert({
      ...rest,
      collection_id: collection.id,
      created_by: 'feed',
    });
  };

  it('refuses every person changing or removing a feed item', async () => {
    const holidays = feedCalendar();
    const day = await feedItem(holidays);
    for (const person of [owner, ann]) {
      await expect(
        call(items.updatePlannerItem, person, {
          params: { itemId: day.id },
          body: { changes: { title: 'Moved' } },
        }),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        call(items.deletePlannerItem, person, { params: { itemId: day.id } }),
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
    expect(test.store.plannerItems.findAny(day.id)?.title).toBe(day.title);
  });

  it('refuses creating an item in a feed calendar', async () => {
    const holidays = feedCalendar();
    await expect(create(owner, dinner(holidays.id))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('still shows the feed item to the people who see the calendar', async () => {
    const holidays = feedCalendar();
    const day = await feedItem(holidays);
    expect(itemRoleOf(test.store, ann.profileId, day)).toBe('view');
    expect(writableCollections(test.store, owner.profileId).map((c) => c.id)).not.toContain(
      holidays.id,
    );
  });
});
