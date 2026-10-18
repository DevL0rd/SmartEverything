import { TuyaCloudError, TuyaResponseError } from '@smarteverything/tuya';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TuyaCloud, TuyaHttpError } from '../../src/adapters/tuya/cloud-client';
import { LoadOnce } from '../../src/adapters/tuya/bounded';
import {
  CLOUD_CONCURRENCY,
  listDevices,
  loadInventory,
  type LoadedSpecification,
} from '../../src/adapters/tuya/cloud-inventory';
import { createTuyaModule } from '../../src/adapters/tuya/module';
import { ACCESS_ID, ACCESS_SECRET, APP_USER, item, type FakeDevice } from './fake-cloud';
import { harness, type Harness } from './harness';

const SECRETS = {
  method: 'developer_project',
  accessId: ACCESS_ID,
  accessSecret: ACCESS_SECRET,
  region: 'eu',
  appUserId: APP_USER,
} as const;

function device(id: string, category: string, extra: Partial<FakeDevice> = {}): FakeDevice {
  return {
    id,
    name: `Device ${id}`,
    category,
    product_id: `p-${category}`,
    local_key: 'abcdefghijklmnop',
    sub: false,
    online: true,
    ...extra,
  };
}

function specifications(): LoadOnce<LoadedSpecification> {
  return new LoadOnce<LoadedSpecification>();
}

let current: Harness | null = null;

function setup(now = (): number => 1_000_000): Harness {
  current = harness(6668, { now });
  return current;
}

afterEach(async () => {
  await current?.messages.close();
  current = null;
});

describe('Tuya cloud client', () => {
  it('signs every request and reuses its token until a minute before expiry', async () => {
    let clock = 1_000_000;
    const { cloud, dependencies } = setup(() => clock);
    const client = new TuyaCloud(SECRETS, dependencies);
    cloud.devices.push(device('a', 'cz'));
    await listDevices(client, APP_USER);
    await listDevices(client, APP_USER);
    expect(cloud.tokens).toBe(1);
    clock += 7_140_000;
    await listDevices(client, APP_USER);
    expect(cloud.tokens).toBe(2);
    expect(cloud.calls('GET', '/v1.0/token/refresh-1')).toHaveLength(1);
  });

  it('gets a new token and retries once when the cloud says the token is invalid', async () => {
    const { cloud, dependencies } = setup();
    const client = new TuyaCloud(SECRETS, dependencies);
    await listDevices(client, APP_USER);
    cloud.expireToken();
    await listDevices(client, APP_USER);
    expect(cloud.tokens).toBe(2);
    expect(cloud.calls('GET', '/v1.0/token')).toHaveLength(2);
  });

  it('surfaces a refusal as a named error with the code and message', async () => {
    const { cloud, dependencies } = setup();
    cloud.failures.set('GET /v1.3/iot-03/devices', { code: 1106, msg: 'permission deny' });
    await expect(listDevices(new TuyaCloud(SECRETS, dependencies), APP_USER)).rejects.toMatchObject(
      {
        name: 'TuyaCloudError',
        kind: 'permission',
        message: 'Tuya cloud refused listing the app user devices: code 1106, "permission deny".',
      },
    );
  });

  it('refuses a body that is not JSON, naming the HTTP status', async () => {
    const { dependencies } = setup();
    const client = new TuyaCloud(SECRETS, dependencies);
    await expect(
      client.call('reading nothing', { method: 'GET', path: '/nowhere' }, z.unknown()),
    ).rejects.toMatchObject({
      name: 'TuyaHttpError',
      status: 404,
      message: 'Tuya cloud answered reading nothing with HTTP 404 and a body that is not JSON.',
    });
    expect(new TuyaHttpError('x', 500, null).cause).toBeNull();
  });

  it('refuses a success whose result has the wrong shape', async () => {
    const { dependencies } = setup();
    const client = new TuyaCloud(SECRETS, dependencies);
    await expect(
      client.call(
        'listing homes',
        { method: 'GET', path: `/v1.0/users/${APP_USER}/homes` },
        z.string(),
      ),
    ).rejects.toBeInstanceOf(TuyaResponseError);
  });

  it('sends a JSON body with its content type and signature', async () => {
    const { cloud, dependencies } = setup();
    const client = new TuyaCloud(SECRETS, dependencies);
    await client.call(
      'switching',
      {
        method: 'POST',
        path: '/v1.0/iot-03/devices/a/commands',
        body: '{"commands":[{"code":"switch_1","value":true}]}',
      },
      z.literal(true),
    );
    expect(cloud.calls('POST', '/v1.0/iot-03/devices/a/commands')[0]?.body).toStrictEqual({
      commands: [{ code: 'switch_1', value: true }],
    });
  });

  it('reports a wrong secret as a signature refusal', async () => {
    const { dependencies } = setup();
    const client = new TuyaCloud({ ...SECRETS, accessSecret: 'wrong' }, dependencies);
    await expect(listDevices(client, APP_USER)).rejects.toMatchObject({
      code: 1004,
      kind: 'credentials',
    });
  });
});

describe('Tuya inventory', () => {
  it('pages through every device and reads each specification', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(device('a', 'cz'), device('b', 'dj'), device('c', 'wsdcg'));
    cloud.specs.set('a', {
      functions: [item('switch_1', 1, 'Boolean')],
      status: [item('switch_1', 1, 'Boolean')],
    });
    cloud.failures.set('GET /v1.1/devices/c/specifications', {
      code: 2009,
      msg: 'not support this device',
    });
    const inventory = await loadInventory(
      new TuyaCloud(SECRETS, dependencies),
      APP_USER,
      context.log,
      specifications(),
    );
    expect(
      inventory.devices.map((loaded) => [
        loaded.cloud.id,
        loaded.points.length,
        loaded.specificationPublished,
      ]),
    ).toStrictEqual([
      ['a', 1, true],
      ['b', 0, true],
      ['c', 0, false],
    ]);
    expect(cloud.calls('GET', '/v1.3/iot-03/devices')).toHaveLength(2);
  });

  it('reuses specifications across inventory loads and reads only new devices', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(device('a', 'cz'), device('b', 'dj'));
    const client = new TuyaCloud(SECRETS, dependencies);
    const shared = specifications();
    await loadInventory(client, APP_USER, context.log, shared);
    const specificationCalls = (): number =>
      cloud.requests.filter((request) => request.path.endsWith('/specifications')).length;
    expect(specificationCalls()).toBe(2);
    await loadInventory(client, APP_USER, context.log, shared);
    expect(specificationCalls()).toBe(2);
    cloud.devices.push(device('c', 'wsdcg'));
    const grown = await loadInventory(client, APP_USER, context.log, shared);
    expect(grown.devices).toHaveLength(3);
    expect(specificationCalls()).toBe(3);
  });

  it('reads specifications with a small bounded parallelism', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => device(id, 'cz')));
    let inFlight = 0;
    let peak = 0;
    const slow: typeof dependencies.fetch = async (url, init) => {
      const reading = url.includes('/specifications');
      inFlight += reading ? 1 : 0;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= reading ? 1 : 0;
      return dependencies.fetch(url, init);
    };
    const bounded = new TuyaCloud(SECRETS, { ...dependencies, fetch: slow });
    const inventory = await loadInventory(bounded, APP_USER, context.log, specifications());
    expect(inventory.devices).toHaveLength(8);
    expect(peak).toBe(CLOUD_CONCURRENCY);
  });

  it('places devices in their rooms and works without room access', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(device('a', 'cz'), device('b', 'dj'));
    cloud.homes.push({
      home_id: 7,
      name: 'Home',
      rooms: [{ room_id: 3, name: 'Kitchen', devices: ['b'] }],
    });
    const client = new TuyaCloud(SECRETS, dependencies);
    const placed = await loadInventory(client, APP_USER, context.log, specifications());
    expect(placed.devices.map((loaded) => loaded.room)).toStrictEqual([null, 'Kitchen']);
    cloud.failures.set(`GET /v1.0/users/${APP_USER}/homes`, {
      code: 28841105,
      msg: 'No permissions',
    });
    const unplaced = await loadInventory(client, APP_USER, context.log, specifications());
    expect(unplaced.devices.map((loaded) => loaded.room)).toStrictEqual([null, null]);
  });

  it('fails the inventory on room errors other than permission', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.failures.set(`GET /v1.0/users/${APP_USER}/homes`, { code: 500, msg: 'system error' });
    await expect(
      loadInventory(new TuyaCloud(SECRETS, dependencies), APP_USER, context.log, specifications()),
    ).rejects.toBeInstanceOf(TuyaCloudError);
  });

  it('turns library remotes of a blaster into remote devices and drops their duplicate virtual devices', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(
      device('blaster', 'wnykq'),
      device('remote-1', 'infrared_tv', { sub: true, gateway_id: 'blaster' }),
    );
    cloud.remotes.set('blaster', [
      {
        remote_id: 'remote-1',
        remote_name: 'TV',
        category_id: 2,
        keys: [{ key: 'power', key_id: 1 }],
      },
    ]);
    const inventory = await loadInventory(
      new TuyaCloud(SECRETS, dependencies),
      APP_USER,
      context.log,
      specifications(),
    );
    expect(inventory.devices.map((loaded) => loaded.cloud.id)).toStrictEqual(['blaster']);
    expect(
      inventory.remotes.map((loaded) => [loaded.remote.remote_id, loaded.keys.key_list.length]),
    ).toStrictEqual([['remote-1', 1]]);
    cloud.failures.set('GET /v2.0/infrareds/blaster/remotes', {
      code: 1106,
      msg: 'permission deny',
    });
    const without = await loadInventory(
      new TuyaCloud(SECRETS, dependencies),
      APP_USER,
      context.log,
      specifications(),
    );
    expect(without.remotes).toStrictEqual([]);
    expect(without.devices.map((loaded) => loaded.cloud.id)).toStrictEqual(['blaster', 'remote-1']);
  });
});

describe('linking a Tuya project', () => {
  it('checks the credentials by listing the app user devices and stores what start needs', async () => {
    const { cloud, dependencies, context } = setup();
    cloud.devices.push(device('a', 'cz'));
    const account = await createTuyaModule(dependencies).link(
      { provider: 'tuya', ...SECRETS },
      context,
    );
    expect(account).toStrictEqual({
      label: 'Developer project · EU · 1 device',
      secrets: { ...SECRETS },
    });
  });

  it('refuses wrong credentials', async () => {
    const { dependencies, context } = setup();
    await expect(
      createTuyaModule(dependencies).link(
        { provider: 'tuya', ...SECRETS, accessSecret: 'nope' },
        context,
      ),
    ).rejects.toMatchObject({
      problem: 'bad_credentials',
      cause: { kind: 'credentials' },
    });
  });

  it('asks for attention when the stored project is no longer allowed to read devices', async () => {
    const { cloud, dependencies, context, attention } = setup();
    cloud.failures.set('GET /v1.3/iot-03/devices', { code: 28841002, msg: 'subscription expired' });
    await expect(
      createTuyaModule(dependencies).start({ label: 'x', secrets: { ...SECRETS } }, context),
    ).rejects.toBeInstanceOf(TuyaCloudError);
    expect(attention).toStrictEqual([
      'Tuya cloud refused listing the app user devices: code 28841002, "subscription expired".',
    ]);
  });

  it('does not ask for attention for a passing cloud fault', async () => {
    const { cloud, dependencies, context, attention } = setup();
    cloud.failures.set('GET /v1.3/iot-03/devices', { code: 500, msg: 'system error' });
    await expect(
      createTuyaModule(dependencies).start({ label: 'x', secrets: { ...SECRETS } }, context),
    ).rejects.toBeInstanceOf(TuyaCloudError);
    expect(attention).toStrictEqual([]);
  });
});
