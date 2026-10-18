import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { phoneWatchSource } from '../../src/phones/phone-watch';
import { captureLogs } from '../support/logs';
import {
  addPerson,
  addPhoneDevice,
  idlePhoneNodes,
  STORED_DETAIL,
  type TestPerson,
} from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let phoneId: string;

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  phoneId = addPhoneDevice(test, {
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  }).device.id;
  test.store.phoneDetails.merge(phoneId, STORED_DETAIL);
});

afterEach(async () => {
  await test.close();
});

function source(): ReturnType<typeof phoneWatchSource> {
  return phoneWatchSource(test.store, idlePhoneNodes(test), {
    hold: (): void => undefined,
    release: (): void => undefined,
  });
}

describe('who may keep a phone in live mode', () => {
  it('lets the phone’s person and the owner watch it live', () => {
    expect(source().allowed(dana.client, phoneId)).toBe(true);
    expect(source().allowed(owner.client, phoneId)).toBe(true);
  });

  it('keeps another member from switching on live mode of someone else’s phone', () => {
    expect(source().allowed(sam.client, phoneId)).toBe(false);
  });

  it('allows nothing that is not a phone', () => {
    const [lamp] = test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'light:1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'm',
        manufacturer: 'v',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    expect(source().allowed(owner.client, lamp?.id ?? '')).toBe(false);
  });

  it('opens a watch with each section dated by its own report', () => {
    const notice = source().keyframe(phoneId, dana.client);
    expect(notice?.type === 'phone_detail' ? notice.parts.power?.at : null).toBe(
      STORED_DETAIL.power?.at,
    );
  });
});
