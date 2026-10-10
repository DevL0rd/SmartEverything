import type { JsonValue } from '@smarteverything/domain';
import type { ProviderAdapter } from '@smarteverything/domain';
import type { StoredAccount } from '../../src/adapters/contract';
import { storedAccountOf } from '../../src/adapters/xiaomi/account';
import { createXiaomiModule } from '../../src/adapters/xiaomi/module';
import { FakeAccount, SSECURITY, USER_ID } from './fake-account';
import { FakeCloud } from './fake-cloud';
import { FakeMiioDevice } from './fake-device';
import { fakeGo2rtc, fakeMotor, type FakeGo2rtc } from './fake-go2rtc';
import { dependencies, harness, recorder, routedFetch, type Harness } from './harness';

const PURIFIER_TOKEN = '00112233445566778899aabbccddeeff';
const CAMERA_TOKEN = 'ffeeddccbbaa99887766554433221100';

export interface World {
  readonly account: FakeAccount;
  readonly cloud: FakeCloud;
  readonly purifier: FakeMiioDevice;
  readonly go2rtc: FakeGo2rtc;
  readonly harness: Harness;
  readonly seen: string[];
  readonly stored: StoredAccount;
  readonly port: number;
  readonly unsubscribers: (() => Promise<void>)[];
}

function cloudDevices(): JsonValue[] {
  return [
    {
      did: '100001',
      name: 'Purifier',
      model: 'zhimi.airp.mb5',
      token: PURIFIER_TOKEN,
      localip: '127.0.0.2',
      parent_id: '',
      isOnline: true,
    },
    {
      did: '100002',
      name: 'Gateway',
      model: 'lumi.gateway.mgl03',
      token: '',
      localip: '',
      isOnline: true,
    },
    {
      did: 'lumi.158d0001',
      name: 'Hall motion',
      model: 'lumi.sensor_motion.aq2',
      parent_id: '100002',
      isOnline: true,
    },
    {
      did: '100003',
      name: 'Door camera',
      model: 'xiaomi.camera.091ac1',
      token: CAMERA_TOKEN,
      localip: '127.0.0.3',
      isOnline: true,
    },
    { did: '100004', name: 'Kettle', model: 'yunmi.kettle.unknown', isOnline: false },
  ];
}

export async function createWorld(): Promise<World> {
  const account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
  account.passTokens.add('V1:pass-0');
  account.serviceToken = 'service-0';
  const cloud = new FakeCloud(account);
  cloud.devices = cloudDevices();
  cloud.homes = {
    homelist: [{ name: 'Home', roomlist: [{ name: 'Living room', dids: ['100001', '100003'] }] }],
  };
  cloud.cloudProperties.set('lumi.158d0001/2.1', false);
  cloud.cloudProperties.set('lumi.158d0001/2.2', 120);
  cloud.cloudProperties.set('100003/2.1', true);
  cloud.cloudProperties.set('100003/30.2', 0);
  const purifier = new FakeMiioDevice({
    host: '127.0.0.2',
    deviceId: 100001,
    token: PURIFIER_TOKEN,
    properties: { '2.1': true, '2.4': 0, '3.4': 12, '4.1': 80 },
  });
  const port = await purifier.start();
  const stored = storedAccountOf({
    userId: USER_ID,
    passToken: 'V1:pass-0',
    ssecurity: SSECURITY,
    serviceToken: 'service-0',
    deviceId: 'DEVICEID12345678',
    region: 'de',
  });
  return {
    account,
    cloud,
    purifier,
    go2rtc: fakeGo2rtc(),
    harness: await harness(() => ''),
    seen: [],
    stored,
    port,
    unsubscribers: [],
  };
}

export async function destroyWorld(world: World): Promise<void> {
  await Promise.all(world.unsubscribers.splice(0).map((unsubscribe) => unsubscribe()));
  await world.purifier.stop();
  await world.harness.cleanup();
}

export async function startAdapter(
  world: World,
  motor: 'go2rtc' | 'absent' = 'go2rtc',
): Promise<ProviderAdapter> {
  const fetch = routedFetch([world.account.route, world.cloud.route], world.seen);
  const module = createXiaomiModule(
    dependencies(fetch, world.port),
    motor === 'go2rtc' ? fakeMotor(world.go2rtc) : null,
  );
  return module.start(world.stored, world.harness.context);
}

export async function subscribe(
  world: World,
  adapter: ProviderAdapter,
): Promise<ReturnType<typeof recorder>> {
  const recorded = recorder();
  world.unsubscribers.push(await adapter.subscribe(recorded.sink));
  return recorded;
}
