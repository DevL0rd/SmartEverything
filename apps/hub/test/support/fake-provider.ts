import type {
  AdapterSink,
  DeviceCommand,
  DiscoveredDevice,
  JsonValue,
  ProviderAdapter,
  StateUpdate,
} from '@smarteverything/domain';
import type {
  LinkContext,
  ProviderModule,
  RunContext,
  StoredAccount,
} from '../../src/adapters/contract';

export const LAMP: DiscoveredDevice = {
  provider: 'xiaomi',
  externalId: 'lamp-1',
  parentExternalId: null,
  kind: 'light',
  name: 'Desk lamp',
  model: 'yeelink.light.lamp1',
  manufacturer: 'Yeelight',
  room: 'Study',
  online: true,
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    {
      key: 'brightness',
      label: 'Brightness',
      access: 'read_write',
      value: { kind: 'number', min: 1, max: 100, step: 1, unit: '%' },
    },
    {
      key: 'temperature',
      label: 'Temperature',
      access: 'read',
      value: { kind: 'number', min: -40, max: 80, step: 0.1 },
    },
  ],
  details: {},
};

export const CAMERA: DiscoveredDevice = {
  provider: 'xiaomi',
  externalId: 'camera-1',
  parentExternalId: 'gateway-1',
  kind: 'camera',
  name: 'Front door',
  model: 'chuangmi.camera.v1',
  manufacturer: 'Xiaomi',
  room: 'Hall',
  online: true,
  capabilities: [
    { key: 'privacy_mode', label: 'Privacy', access: 'read_write', value: { kind: 'boolean' } },
  ],
  details: { go2rtcSource: 'rtsp://camera.local/stream', physicalPtz: true, twoWayAudio: false },
};

export const GATEWAY: DiscoveredDevice = {
  ...LAMP,
  externalId: 'gateway-1',
  kind: 'gateway',
  name: 'Gateway',
  room: null,
  capabilities: [],
};

export class FakeAdapter implements ProviderAdapter {
  readonly provider = 'xiaomi';
  readonly executed: DeviceCommand[] = [];
  sink: AdapterSink | null = null;
  unsubscribed = 0;
  devices: readonly DiscoveredDevice[] = [LAMP];
  states: readonly StateUpdate[] = [];
  failure: Error | null = null;
  result: JsonValue = null;

  discover = (): Promise<readonly DiscoveredDevice[]> => Promise.resolve(this.devices);

  subscribe = (sink: AdapterSink): Promise<() => Promise<void>> => {
    this.sink = sink;
    return Promise.resolve(() => {
      this.unsubscribed += 1;
      return Promise.resolve();
    });
  };

  execute = (command: DeviceCommand): Promise<JsonValue> => {
    this.executed.push(command);
    return this.failure === null ? Promise.resolve(this.result) : Promise.reject(this.failure);
  };

  refresh = (externalIds: readonly string[]): Promise<readonly StateUpdate[]> =>
    Promise.resolve(this.states.filter((state) => externalIds.includes(state.externalId)));
}

export interface FakeModule {
  readonly module: ProviderModule<'xiaomi'>;
  readonly adapter: FakeAdapter;
  readonly linked: { readonly username: string; readonly context: LinkContext }[];
  readonly started: { readonly account: StoredAccount; readonly context: RunContext }[];
  linkFailure: Error | null;
  askDuringLink: boolean;
}

export function fakeModule(): FakeModule {
  const adapter = new FakeAdapter();
  const fake: FakeModule = {
    adapter,
    linked: [],
    started: [],
    linkFailure: null,
    askDuringLink: false,
    module: {
      provider: 'xiaomi',
      link: async (credentials, context): Promise<StoredAccount> => {
        fake.linked.push({ username: credentials.username, context });
        if (fake.linkFailure !== null) {
          throw fake.linkFailure;
        }
        const code = fake.askDuringLink
          ? await context.ask({ kind: 'verification_code', destination: 'p***@example.com' })
          : 'none';
        return { label: credentials.username, secrets: { token: `token-${code}` } };
      },
      start: (account, context): Promise<ProviderAdapter> => {
        fake.started.push({ account, context });
        return Promise.resolve(adapter);
      },
    },
  };
  return fake;
}
