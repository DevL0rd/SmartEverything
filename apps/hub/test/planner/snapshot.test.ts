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
      test.store.plannerCollections.insert({
        profile_id: person.profileId,
        kind: 'calendar',
        name: `Calendar of ${person.profileId}`,
        colour: 'home',
        icon: 'house',
        position: 0,
        visible: true,
        default_reminders: [],
        source: 'local',
        google: null,
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
    expect(tables.planner_collections.map((row) => row.profile_id)).toStrictEqual([ann.profileId]);
    expect(tables.google_accounts.map((row) => row.profile_id)).toStrictEqual([ann.profileId]);
  });

  it('gives the owner every person’s rows', () => {
    const tables = plannerTablesOf(test.store, {
      client: owner.client,
      profileId: owner.profileId,
    });
    expect(tables.planner_collections.map((row) => row.profile_id).sort()).toStrictEqual(
      [ann.profileId, bob.profileId].sort(),
    );
    expect(tables.google_accounts).toHaveLength(2);
  });
});
