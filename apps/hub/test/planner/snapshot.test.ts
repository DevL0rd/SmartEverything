import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plannerTablesOf } from '../../src/server/handlers/snapshot';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

describe('the planner tables of the snapshot in the store', () => {
  let test: TestStore;
  let owner: TestPerson;
  let ann: TestPerson;
  let bob: TestPerson;

  beforeEach(async () => {
    test = await testStore();
    owner = addPerson(test, 'Owner', 'owner');
    ann = addPerson(test, 'Ann', 'member');
    bob = addPerson(test, 'Bob', 'member');
    for (const person of [ann, bob]) {
      const collection = test.store.plannerCollections.insert({
        profile_id: person.profileId,
        kind: 'calendar',
        name: `Calendar of ${person.profileId}`,
        colour: 'home',
        icon: 'house',
        position: 0,
        visible: true,
        default_reminders: [],
        audience: 'personal',
        source: 'local',
        google: null,
        feed: null,
      });
      const item = test.store.plannerItems.insert({
        profile_id: person.profileId,
        collection_id: collection.id,
        kind: 'event',
        parent_id: null,
        title: 'Dinner',
        notes: '',
        location: null,
        priority: null,
        tags: [],
        estimate_minutes: null,
        start_local: '2026-11-09T19:00',
        end_local: '2026-11-09T20:00',
        time_zone: 'UTC',
        all_day: false,
        due_date: null,
        due_at: null,
        rrule: null,
        exdates: [],
        series_id: null,
        original_start: null,
        start: '2026-11-09T19:00:00.000Z',
        end: '2026-11-09T20:00:00.000Z',
        series_end: null,
        status: 'open',
        position: 0,
        completion: { kind: 'manual' },
        attachments: [],
        reminders: [],
        google: null,
        assignee_id: null,
        ical_uid: null,
        ical_sequence: 0,
        booking_page_id: null,
        created_by: 'person',
      });
      test.store.plannerGuests.insert({
        item_id: item.id,
        kind: 'email',
        profile_id: null,
        email: `${person.profileId}@example.com`,
        name: null,
        delivery: 'link_only',
        delivery_detail: null,
        token_hash: person.profileId.replaceAll('-', '').padEnd(64, '0'),
      });
      test.store.plannerBookingPages.insert(person.profileId, {
        collection_id: collection.id,
        title: 'Call',
        description: '',
        minutes: 30,
        availability: [{ day: 1, start: '09:00', end: '12:00' }],
        buffer_before: 0,
        buffer_after: 0,
        notice_minutes: 0,
        ahead_days: 14,
        location: null,
        enabled: true,
      });
      test.store.googleAccounts.insert({
        profile_id: person.profileId,
        email: 'person@example.com',
        scopes: ['openid'],
        status: 'linked',
        problem: null,
        calendar_ids: [],
        list_ids: [],
        last_sync_at: null,
        last_error: null,
      });
    }
  });

  afterEach(async () => {
    await test.close();
  });

  it('gives a member only their own rows', () => {
    const tables = plannerTablesOf(test.store, { client: ann.client, profileId: ann.profileId });
    expect(tables.planner_collections.map((row) => row.profile_id)).toStrictEqual([
      ann.profileId,
      ...test.store.plannerCollections.household().map((row) => row.profile_id),
    ]);
    expect(tables.google_accounts.map((row) => row.profile_id)).toStrictEqual([ann.profileId]);
    expect(tables.planner_booking_pages.map((row) => row.profile_id)).toStrictEqual([
      ann.profileId,
    ]);
    expect(tables.planner_guests.map((row) => row.email)).toStrictEqual([
      `${ann.profileId}@example.com`,
    ]);
  });

  it('gives a member the shares of their calendars and of calendars shared with them', () => {
    const [annCollection] = test.store.plannerCollections.list(ann.profileId);
    const [bobCollection] = test.store.plannerCollections.list(bob.profileId);
    if (annCollection === undefined || bobCollection === undefined)
      throw new Error('no collection');
    test.store.plannerShares.save({
      collection_id: annCollection.id,
      profile_id: bob.profileId,
      role: 'view',
    });
    test.store.plannerShares.save({
      collection_id: bobCollection.id,
      profile_id: owner.profileId,
      role: 'edit',
    });
    const key = (row: { collection_id: string; profile_id: string }): string =>
      `${row.collection_id}/${row.profile_id}`;
    const asAnn = plannerTablesOf(test.store, { client: ann.client, profileId: ann.profileId });
    expect(asAnn.planner_collection_shares.map(key)).toStrictEqual([
      key({ collection_id: annCollection.id, profile_id: bob.profileId }),
    ]);
    const asBob = plannerTablesOf(test.store, { client: bob.client, profileId: bob.profileId });
    expect(asBob.planner_collection_shares.map(key).sort()).toStrictEqual(
      [
        key({ collection_id: annCollection.id, profile_id: bob.profileId }),
        key({ collection_id: bobCollection.id, profile_id: owner.profileId }),
      ].sort(),
    );
  });

  it('gives the owner every person’s rows', () => {
    const tables = plannerTablesOf(test.store, {
      client: owner.client,
      profileId: owner.profileId,
    });
    const own = tables.planner_collections.filter((row) => row.audience === 'personal');
    expect(own.map((row) => row.profile_id).sort()).toStrictEqual(
      [ann.profileId, bob.profileId].sort(),
    );
    expect(tables.planner_collections.filter((row) => row.audience === 'household')).toHaveLength(
      1,
    );
    expect(tables.google_accounts).toHaveLength(2);
    expect(tables.planner_guests).toHaveLength(2);
    expect(tables.planner_booking_pages).toHaveLength(2);
  });
});
