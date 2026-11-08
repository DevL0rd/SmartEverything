import { readFileSync } from 'node:fs';
import { type ProviderAdapter } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_FAMILIES } from '@smarteverything/domain';
import type { DeviceIo } from '../../src/adapters/xiaomi/device-io';
import { storedAccountOf } from '../../src/adapters/xiaomi/account';
import { familyHooks } from '../../src/adapters/xiaomi/family-hooks';
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
const HOST = '127.0.0.9';
const DID = '5550004';
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
  vacuum.offersPush = true;
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

const RESYNC = { siid: 10, aiid: 7, inputs: [] } as const;

function sentActions(): readonly { siid: number; aiid: number; inputs: readonly unknown[] }[] {
  return vacuum.actions.map(({ siid, aiid, inputs }) => ({ siid, aiid, inputs }));
}

describe('the subscribe resync through the Xiaomi adapter', () => {
  it('sends action 10.7 once for the vacuum when its push subscription opens', async () => {
    await adapter.discover();
    const recorded = recorder();
    unsubscribe = await adapter.subscribe(recorded.sink);
    await waitFor(() => recorded.states.length > 0);
    await waitFor(() => vacuum.actions.length > 0);
    await waitFor(() => recorded.states.some(({ capability }) => capability === 'raw:2.16'));
    expect(sentActions()).toStrictEqual([RESYNC]);
  });

  it('never sends it for a device that is not a vacuum', async () => {
    const sent: string[] = [];
    const unused = (): Promise<never> =>
      Promise.reject(new Error('the resync only sends an action'));
    const io: DeviceIo = {
      transport: 'lan',
      read: unused,
      write: unused,
      miio: unused,
      close: unused,
      action: (address) => {
        sent.push(`${String(address.siid)}.${String(address.aiid)}`);
        return Promise.resolve(null);
      },
    };
    for (const family of DEVICE_FAMILIES.filter((candidate) => candidate !== 'vacuum')) {
      await familyHooks(family).subscribed(io);
    }
    expect(sent).toStrictEqual([]);
    await familyHooks('vacuum').subscribed(io);
    expect(sent).toStrictEqual(['10.7']);
  });
});
