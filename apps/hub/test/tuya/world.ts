import type { ProviderAdapter, Unsubscribe } from '@smarteverything/domain';
import { createTuyaModule } from '../../src/adapters/tuya/module';
import { ACCESS_ID, ACCESS_SECRET, APP_USER, item, type FakeDevice } from './fake-cloud';
import { FakeTuyaDevice } from './fake-device';
import { RecordingSink, announce, announcementFrame, harness, type Harness } from './harness';

const KEY = 'abcdefghijklmnop';
export const NEW_KEY = 'qrstuvwxyzabcdef';
const SECRETS = {
  accessId: ACCESS_ID,
  accessSecret: ACCESS_SECRET,
  region: 'eu',
  appUserId: APP_USER,
} as const;

export interface World {
  readonly h: Harness;
  readonly plug: FakeTuyaDevice;
  readonly gateway: FakeTuyaDevice;
  readonly blaster: FakeTuyaDevice;
  readonly adapter: ProviderAdapter;
  readonly sink: RecordingSink;
  readonly unsubscribe: Unsubscribe;
  readonly announce: (deviceId: string, ip: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

function cloudDevice(id: string, category: string, extra: Partial<FakeDevice> = {}): FakeDevice {
  return {
    id,
    name: `Device ${id}`,
    category,
    product_id: `p-${category}`,
    local_key: KEY,
    sub: false,
    online: true,
    ...extra,
  };
}

export function waitFor(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = (): void => {
      if (condition()) {
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        reject(new Error(`timed out waiting for ${what}`));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
}

function stockDevices(h: Harness): void {
  h.cloud.devices.push(
    cloudDevice('plug1', 'cz'),
    cloudDevice('gw1', 'wg2'),
    cloudDevice('pir1', 'pir', { sub: true, gateway_id: 'gw1', node_id: 'node-pir' }),
    cloudDevice('th1', 'wsdcg'),
    cloudDevice('cz2', 'cz'),
    cloudDevice('ir1', 'wnykq'),
    cloudDevice('ir2', 'wnykq'),
  );
  h.cloud.remotes.set('ir1', [
    {
      remote_id: 'tv-1',
      remote_name: 'Lounge TV',
      category_id: 2,
      keys: [
        { key: 'power', key_id: 1 },
        { key: 'volume_up', key_id: 5 },
      ],
    },
  ]);
  h.cloud.failures.set('GET /v1.1/devices/ir2/specifications', {
    code: 2009,
    msg: 'not support this device',
  });
}

function stock(h: Harness): void {
  stockDevices(h);
  const plugSpec = {
    functions: [item('switch_1', 1, 'Boolean')],
    status: [
      item('switch_1', 1, 'Boolean'),
      item('cur_power', 19, 'Integer', { min: 0, max: 50000, scale: 1, step: 1, unit: 'W' }),
    ],
  };
  h.cloud.specs.set('plug1', plugSpec);
  h.cloud.specs.set('cz2', plugSpec);
  h.cloud.specs.set('pir1', {
    functions: [],
    status: [
      item('pir', 1, 'Enum', { range: ['pir', 'none'] }),
      item('battery_percentage', 4, 'Integer', { min: 0, max: 100, scale: 0, step: 1 }),
    ],
  });
  h.cloud.specs.set('th1', {
    functions: [],
    status: [
      item('va_temperature', 1, 'Integer', { min: -200, max: 600, scale: 1, step: 1, unit: '℃' }),
      item('battery_percentage', 4, 'Integer', { min: 0, max: 100, scale: 0, step: 1 }),
    ],
  });
  h.cloud.failures.set('GET /v1.1/devices/ir1/specifications', {
    code: 2009,
    msg: 'not support this device',
  });
  h.cloud.failures.set('GET /v1.1/devices/gw1/specifications', {
    code: 2009,
    msg: 'not support this device',
  });
  h.cloud.statuses.set('cz2', [
    { code: 'switch_1', value: true },
    { code: 'cur_power', value: 30 },
  ]);
}

export async function world(): Promise<World> {
  const plug = new FakeTuyaDevice('plug1', KEY);
  const port = await plug.listen('127.0.0.1');
  const gateway = new FakeTuyaDevice('gw1', KEY);
  await gateway.listen('127.0.0.2', port);
  const blaster = new FakeTuyaDevice('ir1', KEY);
  await blaster.listen('127.0.0.3', port);
  plug.dps.set(null, { '1': false, '19': 125 });
  gateway.dps.set(null, {});
  gateway.dps.set('node-pir', { '1': 'none', '4': 80 });
  blaster.dps.set(null, { '1': 'study_exit', '13': 0 });
  const h = harness(port);
  await h.messages.ready;
  stock(h);
  const adapter = await createTuyaModule(h.dependencies).start(
    { label: 'x', secrets: { ...SECRETS } },
    h.context,
  );
  await adapter.discover();
  const sink = new RecordingSink();
  const unsubscribe = await adapter.subscribe(sink);
  await waitFor(() => h.messages.connected === 1, 'the message service connection');
  return {
    h,
    plug,
    gateway,
    blaster,
    adapter,
    sink,
    unsubscribe,
    announce: (deviceId, ip) => announce(h.udpSockets, announcementFrame(deviceId, ip)),
    close: async (): Promise<void> => {
      await unsubscribe();
      await Promise.all([plug.close(), gateway.close(), blaster.close(), h.messages.close()]);
    },
  };
}
