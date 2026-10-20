import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import {
  SMART_LIFE_HOMES,
  SMART_LIFE_PATHS,
  type SmartLifeSession,
  type TuyaCloudError,
} from '@smarteverything/tuya';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LoadOnce } from '../../src/adapters/tuya/bounded';
import { SmartLifeCloud, TuyaHttpError } from '../../src/adapters/tuya/smart-life-cloud';
import {
  CLOUD_CONCURRENCY,
  loadSmartLifeInventory,
  type DescribedDevice,
} from '../../src/adapters/tuya/smart-life-inventory';
import { FakeSmartLife, wnykqDevice, item, type FakeDevice } from './fake-cloud';
import { HOME_ID, S06_POINTS } from './recorded';

const START = 1_000_000;

function plain(id: string, category: string, extra: Partial<FakeDevice> = {}): FakeDevice {
  return {
    id,
    name: `Device ${id}`,
    category,
    product_id: `p-${category}`,
    local_key: 'abcdefghijklmnop',
    sub: false,
    online: true,
    status: [],
    ...extra,
  };
}

interface Setup {
  readonly fake: FakeSmartLife;
  readonly cloud: SmartLifeCloud;
  readonly renewed: SmartLifeSession[];
  readonly lost: TuyaCloudError[];
  readonly clock: { now: number };
}

function setup(fetchOf?: (inner: FakeSmartLife['fetch']) => FakeSmartLife['fetch']): Setup {
  const clock = { now: START };
  const fake = new FakeSmartLife(() => clock.now);
  const renewed: SmartLifeSession[] = [];
  const lost: TuyaCloudError[] = [];
  const cloud = new SmartLifeCloud({
    session: fake.session(),
    dependencies: {
      fetch: fetchOf === undefined ? fake.fetch : fetchOf(fake.fetch),
      now: (): number => clock.now,
      nonce: (): string => randomUUID().replaceAll('-', ''),
      requestId: (): string => randomUUID(),
    },
    renewed: (session): Promise<void> => {
      renewed.push(session);
      return Promise.resolve();
    },
    lost: (cause): Promise<void> => {
      lost.push(cause);
      return Promise.resolve();
    },
  });
  return { fake, cloud, renewed, lost, clock };
}

function homes(cloud: SmartLifeCloud): Promise<z.output<typeof SMART_LIFE_HOMES>> {
  return cloud.call(
    'listing the Smart Life homes',
    { method: 'GET', path: SMART_LIFE_PATHS.homes },
    SMART_LIFE_HOMES,
  );
}

describe('Smart Life cloud client', () => {
  it('seals and signs each request so the cloud accepts it, and opens the sealed reply', async () => {
    const { cloud, fake } = setup();
    await expect(homes(cloud)).resolves.toStrictEqual([{ ownerId: HOME_ID, name: 'Home' }]);
    expect(fake.calls('GET', SMART_LIFE_PATHS.homes)).toHaveLength(1);
  });

  it('renews an expiring session once for concurrent calls and writes the new tokens back', async () => {
    const { cloud, fake, renewed, clock } = setup();
    clock.now += 7_150_000;
    await Promise.all([homes(cloud), homes(cloud), homes(cloud)]);
    expect(fake.refreshes).toBe(1);
    expect(renewed).toHaveLength(1);
    expect(renewed[0]).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      userCode: fake.session().userCode,
    });
    expect(renewed[0]?.expiresAt).toBe(clock.now + 7_200_000);
    await homes(cloud);
    expect(fake.refreshes).toBe(1);
  });

  it('reports a session the cloud has ended and fails the call with the cloud code', async () => {
    const { cloud, fake, lost, clock } = setup();
    fake.endSession();
    clock.now += 7_150_000;
    await expect(homes(cloud)).rejects.toMatchObject({ name: 'TuyaCloudError', kind: 'token' });
    expect(lost).toHaveLength(1);
    expect(lost[0]?.code).toBe(1010);
  });

  it('refuses a body that is not JSON, naming the HTTP status', async () => {
    const { cloud } = setup(
      () => (): Promise<Response> => Promise.resolve(new Response('gateway down', { status: 502 })),
    );
    await expect(homes(cloud)).rejects.toMatchObject({
      name: 'TuyaHttpError',
      status: 502,
      message:
        'Tuya cloud answered listing the Smart Life homes with HTTP 502 and a body that is not JSON.',
    });
    expect(new TuyaHttpError('x', 500, null).cause).toBeNull();
  });
});

describe('Smart Life inventory from the cloud', () => {
  function descriptions(): LoadOnce<DescribedDevice> {
    return new LoadOnce<DescribedDevice>();
  }

  const log = new Logger('tool.tuya-test');

  it('reads the blaster specification and its infrared data points', async () => {
    const { cloud, fake } = setup();
    fake.devices.push(wnykqDevice('ir1', 'abcdefghijklmnop', { room: 'Lounge' }));
    fake.points.set('ir1', S06_POINTS);
    const loaded = await loadSmartLifeInventory(cloud, log, descriptions());
    const [blaster] = loaded.devices;
    expect(blaster).toMatchObject({
      cloud: { id: 'ir1', category: 'wnykq' },
      room: 'Lounge',
      specificationPublished: true,
      smartLife: { cloudReports: 'data_points', cloudReportReason: 'all_data_points_local' },
    });
    expect(blaster?.points.map((point) => point.code)).toStrictEqual([
      'control',
      'ir_code',
      'key_code',
      'key_study',
      'type',
      'study_code',
      'va_temperature',
      'va_humidity',
    ]);
    expect(loaded.owners).toStrictEqual([HOME_ID]);
    expect(loaded.reportsDataPoints.get('ir1')).toBe(true);
  });

  it('keeps a device whose specification is unpublished and leaves virtual remotes out', async () => {
    const { cloud, fake } = setup();
    fake.devices.push(
      plain('plug', 'cz'),
      plain('remote', 'infrared_tv', { sub: true, gateway_id: 'ir1' }),
    );
    fake.points.set('plug', [item('switch_1', 1, 'Boolean')]);
    fake.failures.set('GET /v1.1/m/life/plug/specifications', {
      code: 2009,
      msg: 'not support this device',
    });
    const loaded = await loadSmartLifeInventory(cloud, log, descriptions());
    expect(
      loaded.devices.map((device) => [device.cloud.id, device.specificationPublished]),
    ).toEqual([['plug', false]]);
  });

  it('reads descriptions with a small bounded parallelism', async () => {
    let inFlight = 0;
    let peak = 0;
    const { cloud, fake } = setup((inner) => async (url, init): Promise<Response> => {
      const reading = url.includes('/specifications');
      inFlight += reading ? 1 : 0;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= reading ? 1 : 0;
      return inner(url, init);
    });
    fake.devices.push(...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => plain(id, 'cz')));
    const loaded = await loadSmartLifeInventory(cloud, log, descriptions());
    expect(loaded.devices).toHaveLength(8);
    expect(peak).toBe(CLOUD_CONCURRENCY);
  });
});
