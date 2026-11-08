import { readFileSync } from 'node:fs';
import {
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_CLEAN_ZONES_KEY,
  type CapabilityKey,
  type DeviceCommand,
  type ProviderAdapter,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storedAccountOf } from '../../src/adapters/xiaomi/account';
import { createXiaomiModule } from '../../src/adapters/xiaomi/module';
import { FakeVacuum } from '../support/fake-vacuum';
import { FakeAccount, SSECURITY, USER_ID } from '../xiaomi/fake-account';
import { FakeCloud } from '../xiaomi/fake-cloud';
import { plain, type Route } from '../xiaomi/fake-http';
import {
  dependencies,
  harness,
  recorder,
  routedFetch,
  waitFor,
  type Harness,
} from '../xiaomi/harness';

const TOKEN = '0123456789abcdef0123456789abcdef';
const HOST = '127.0.0.8';
const DID = '5550003';
const MODEL = 'xiaomi.vacuum.pv11gl';
const TYPE = 'urn:miot-spec-v2:device:vacuum:0000A006:xiaomi-pv11gl:1';
const SPEC = readFileSync(
  new URL('../../../../packages/xiaomi/test/fixtures/vacuum/pv11gl-spec.json', import.meta.url),
  'utf8',
);

let vacuum: FakeVacuum;
let environment: Harness;
let adapter: ProviderAdapter;
let unsubscribe: (() => Promise<void>) | null = null;

const specRoute: Route = (request) => {
  if (request.url.host !== 'miot-spec.org') return null;
  if (request.url.pathname === '/miot-spec-v2/instances') {
    return plain(
      200,
      JSON.stringify({ instances: [{ model: MODEL, version: 1, type: TYPE, status: 'released' }] }),
    );
  }
  return request.url.searchParams.get('type') === TYPE ? plain(200, SPEC) : plain(404, 'not found');
};

function command(capability: CapabilityKey, value: DeviceCommand['value']): DeviceCommand {
  return { commandId: crypto.randomUUID(), externalId: DID, capability, value };
}

beforeEach(async () => {
  const account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
  account.passTokens.add('V1:pass-0');
  account.serviceToken = 'service-0';
  const cloud = new FakeCloud(account);
  cloud.devices = [
    {
      did: DID,
      name: 'Robot',
      model: MODEL,
      token: TOKEN,
      localip: HOST,
      parent_id: '',
      isOnline: true,
    },
  ];
  vacuum = new FakeVacuum({
    host: HOST,
    deviceId: Number(DID),
    token: TOKEN,
    did: DID,
    uid: '4440004',
  });
  const port = await vacuum.start();
  const rooms = z
    .string()
    .parse(vacuum.properties.get('2.16'))
    .replace('"map_uid":N', '"map_uid":1');
  vacuum.properties.set('2.16', rooms);
  environment = await harness(() => '');
  const fetch = routedFetch([account.route, specRoute, cloud.route]);
  const stored = storedAccountOf({
    userId: USER_ID,
    passToken: 'V1:pass-0',
    ssecurity: SSECURITY,
    deviceId: 'DEVICEID12345678',
    serviceToken: 'service-0',
    region: 'de',
  });
  adapter = await createXiaomiModule(dependencies(fetch, port), null).start(
    stored,
    environment.context,
  );
});

afterEach(async () => {
  await unsubscribe?.();
  unsubscribe = null;
  await vacuum.stop();
  await environment.cleanup();
});

describe('the vacuum through the Xiaomi adapter', () => {
  it('lists the synthetic capabilities and publishes the cleaning reading from the status', async () => {
    const [device] = await adapter.discover();
    expect(device?.capabilities.map(({ key }) => key)).toEqual(
      expect.arrayContaining(['cleaning', VACUUM_CLEAN_ROOMS_KEY, VACUUM_CLEAN_ZONES_KEY]),
    );
    const recorded = recorder();
    unsubscribe = await adapter.subscribe(recorded.sink);
    await waitFor(() => recorded.states.some(({ capability }) => capability === 'cleaning'));
    const reading = recorded.states.find(({ capability }) => capability === 'cleaning');
    expect(reading?.value).toBe('docked');
  });

  it('routes a room clean through the vacuum commands with the tagged wire input', async () => {
    await adapter.discover();
    const recorded = recorder();
    unsubscribe = await adapter.subscribe(recorded.sink);
    await waitFor(() => recorded.states.some(({ capability }) => capability === 'raw:2.16'));
    await adapter.execute(
      command(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['Room4', 'Room2'], repeats: 2 }),
    );
    expect(vacuum.actions).toStrictEqual([
      { siid: 2, aiid: 16, inputs: [{ piid: 15, value: '[3,4]' }], outcome: 'changed' },
    ]);
    expect(vacuum.writes).toStrictEqual([{ siid: 2, piid: 8, value: 2 }]);
    await waitFor(() =>
      recorded.states.some(
        ({ capability, value }) => capability === 'cleaning' && value === 'cleaning',
      ),
    );
  });

  it('routes the cleaning words and refuses a reading word', async () => {
    await adapter.discover();
    const recorded = recorder();
    unsubscribe = await adapter.subscribe(recorded.sink);
    await waitFor(() => recorded.states.length > 0);
    await adapter.execute(command('cleaning', 'start'));
    expect(vacuum.actions.map(({ siid, aiid, inputs }) => [siid, aiid, inputs])).toStrictEqual([
      [2, 1, []],
    ]);
    await expect(adapter.execute(command('cleaning', 'docked'))).rejects.toThrow('not a command');
    expect(vacuum.actions).toHaveLength(1);
  });
});
