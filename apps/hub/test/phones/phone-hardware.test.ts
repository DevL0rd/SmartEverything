import {
  API_ENDPOINTS as E,
  PHONE_REPORT,
  createClientToken,
  hashClientToken,
  type DiscoveredDevice,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceRecord } from '../../src/database/port';
import { phoneExternalId } from '../../src/phones/phone-device';
import { PhoneNodes } from '../../src/phones/phone-nodes';
import type { Caller } from '../../src/server/auth';
import { clientRoutes } from '../../src/server/handlers/client-settings';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const FOLD = { model: 'SM-F966B', manufacturer: 'samsung' };
const TAB = { model: 'SM-X926B', manufacturer: 'samsung' };

let test: TestStore;
let nodes: PhoneNodes;
let applied: DiscoveredDevice[];
let routes: ReturnType<typeof clientRoutes>;

function caller(person: TestPerson): Caller {
  return { kind: 'client', client: person.client };
}

function register(person: TestPerson, body: unknown): Promise<unknown> {
  return routes.savePushTarget.run(
    caller(person),
    { params: {}, query: {}, body, remote: 'test', headers: {} },
    testLogger(),
  );
}

function deviceOf(person: TestPerson): ReturnType<TestStore['store']['devices']['byExternal']> {
  return test.store.devices.byExternal('local', phoneExternalId(person.client.id));
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  applied = [];
  nodes = new PhoneNodes({
    store: test.store,
    apply: (devices): Promise<readonly DeviceRecord[]> => {
      applied.push(...devices);
      return Promise.resolve(
        test.store.devices
          .upsert(
            devices.map((device) => ({
              provider: device.provider,
              externalId: device.externalId,
              parentId: null,
              kind: device.kind,
              name: device.name,
              model: device.model,
              manufacturer: device.manufacturer,
              providerRoom: device.room,
              roomId: null,
              online: device.online,
              capabilities: device.capabilities,
              details: device.details,
            })),
          )
          .map((row) => ({
            id: row.id,
            provider: row.provider,
            externalId: row.external_id,
            parentId: row.parent_id,
            kind: row.kind,
            online: row.online,
            roomId: row.room_id,
            capabilities: row.capabilities,
            details: row.details,
          })),
      );
    },
    forget: (): Promise<void> => Promise.resolve(),
    state: (): void => undefined,
    event: (): void => undefined,
    log: testLogger('phone'),
  });
  routes = clientRoutes(test.store, nodes);
});

afterEach(async () => {
  await test.close();
});

describe('phone hardware registration', () => {
  it('gives phones that share a model string their own hardware identity', async () => {
    const fold = addPerson(test, 'Fold', 'owner');
    const tab = addPerson(test, 'Tab', 'member');
    await register(fold, { token: 'fcm-fold', platform: 'android', hardware: FOLD });
    await register(tab, { token: 'fcm-tab', platform: 'android', hardware: TAB });
    const [foldRow, tabRow] = [deviceOf(fold), deviceOf(tab)];
    expect(foldRow?.model).toBe('smarteverything.android');
    expect(tabRow?.model).toBe('smarteverything.android');
    expect(foldRow?.details).toMatchObject({
      hardwareModel: 'SM-F966B',
      hardwareManufacturer: 'samsung',
    });
    expect(tabRow?.details).toMatchObject({
      hardwareModel: 'SM-X926B',
      hardwareManufacturer: 'samsung',
    });
    expect(test.store.personal.pushTargets().map((target) => target.token)).toEqual([
      'fcm-fold',
      'fcm-tab',
    ]);
  });

  it('keeps the hardware when a later report changes what the phone offers', async () => {
    const fold = addPerson(test, 'Fold', 'owner');
    await register(fold, { token: 'fcm-fold', platform: 'android', hardware: FOLD });
    const identity = {
      clientId: fold.client.id,
      name: fold.client.name,
      profileId: fold.profileId,
    };
    await nodes.report(
      identity,
      PHONE_REPORT.parse({
        at: '2026-10-25T10:00:00.000Z',
        values: { battery: 50 },
        events: [],
        actions: [{ action: 'lock', state: 'ready' }],
      }),
    );
    expect(deviceOf(fold)?.details).toMatchObject({ hardwareModel: 'SM-F966B' });
    expect(deviceOf(fold)?.capabilities.map((capability) => capability.key)).toContain(
      'lock_screen',
    );
  });

  it('learns the hardware from a report alone, with no push token registered', async () => {
    const tab = addPerson(test, 'Tab', 'member');
    const identity = {
      clientId: tab.client.id,
      name: tab.client.name,
      profileId: tab.profileId,
    };
    await nodes.report(
      identity,
      PHONE_REPORT.parse({
        at: '2026-10-25T10:00:00.000Z',
        values: {},
        events: [],
        hardware: TAB,
      }),
    );
    expect(deviceOf(tab)?.details).toMatchObject({
      hardwareModel: 'SM-X926B',
      hardwareManufacturer: 'samsung',
    });
    expect(test.store.personal.pushTargets()).toHaveLength(0);
  });

  it('saves the device again only when the hardware changes', async () => {
    const fold = addPerson(test, 'Fold', 'owner');
    const body = { token: 'fcm-fold', platform: 'android', hardware: FOLD };
    await register(fold, body);
    await register(fold, body);
    expect(applied).toHaveLength(1);
    await register(fold, { ...body, hardware: TAB });
    expect(applied).toHaveLength(2);
    expect(deviceOf(fold)?.details).toMatchObject({ hardwareModel: 'SM-X926B' });
  });

  it('registers the token alone, with no hardware on the device, when none is reported', async () => {
    const old = addPerson(test, 'Old', 'member');
    await register(old, { token: 'fcm-old', platform: 'android' });
    expect(test.store.personal.pushTargets()).toHaveLength(1);
    expect(deviceOf(old)).toBeUndefined();
  });

  it('refuses hardware from a client that is not the Android app and saves no token', async () => {
    const profileId = test.store.profiles.first().id;
    const client = test.store.clients.create({
      name: 'Browser',
      platform: 'web',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
      profileId,
    });
    await expect(
      register({ client, profileId }, { token: 'fcm-web', platform: 'android', hardware: FOLD }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(test.store.personal.pushTargets()).toHaveLength(0);
  });

  it('refuses a blank model and unknown fields', () => {
    const body = E.savePushTarget.body;
    expect(
      body.safeParse({ token: 't', platform: 'android', hardware: { ...FOLD, model: ' ' } })
        .success,
    ).toBe(false);
    expect(
      body.safeParse({ token: 't', platform: 'android', hardware: { ...FOLD, extra: 1 } }).success,
    ).toBe(false);
  });
});
