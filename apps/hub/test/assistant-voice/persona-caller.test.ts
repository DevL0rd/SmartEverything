import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callerOf } from '../../src/assistant-voice/persona';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let sam: TestPerson;

beforeEach(async () => {
  test = await testStore();
  await test.store.live.home.load();
  sam = addPerson(test, 'Sam', 'member');
});

afterEach(async () => {
  await test.close();
});

describe('who a voice call belongs to', () => {
  it('is the person the calling device is currently used by, never the first person of the home', async () => {
    expect(test.store.profiles.first().id).not.toBe(sam.profileId);
    expect(await callerOf(test.store, sam.client, 'Sam phone')).toMatchObject({
      profileId: sam.profileId,
      person: 'Sam',
      role: 'member',
    });
  });

  it('follows an owner device that switches to another person', async () => {
    const owner = addPerson(test, 'Owner', 'owner');
    test.store.clients.useProfile(owner.client.id, sam.profileId);
    expect(await callerOf(test.store, owner.client, 'Owner phone')).toMatchObject({
      profileId: sam.profileId,
      person: 'Sam',
    });
  });
});
