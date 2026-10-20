import {
  CommandRefusedError,
  DEVICE_CAPABILITY,
  type CapabilityKey,
  type DeviceCommand,
  type JsonValue,
  type Provider,
  type ProviderAdapter,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelevisionRouting } from '../src/commands/television-routing';
import { TelevisionWake } from '../src/commands/television-wake';
import type { DeviceRecord } from '../src/database/port';
import { captureLogs, testLogger } from './support/logs';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

const OCF = 'raw:samsungvd.supports_power_on_by_ocf.supports_power_on_by_ocf';

const CAPABILITIES = [
  { key: 'power', access: 'read_write', value: { kind: 'boolean' } },
  { key: 'mute', access: 'read_write', value: { kind: 'boolean' } },
  { key: 'volume', access: 'read_write', value: { kind: 'number', min: 0, max: 100, step: 1 } },
  { key: 'remote_key', access: 'write', value: { kind: 'enum', options: ['up', 'ok', 'vol_up'] } },
  { key: 'app_launch', access: 'write', value: { kind: 'enum', options: ['YouTube', 'Plex'] } },
  { key: 'raw:audio_volume:volume_up', access: 'write', value: { kind: 'action' } },
  { key: 'raw:audio_volume:volume_down', access: 'write', value: { kind: 'action' } },
  { key: OCF, access: 'read', value: { kind: 'enum', options: ['true', 'false'] } },
].map((entry) => DEVICE_CAPABILITY.parse({ ...entry, label: entry.key }));

const TV: DeviceRecord = {
  id: DEVICE_ID,
  provider: 'smartthings',
  externalId: 'st-tv',
  parentId: null,
  kind: 'television',
  online: true,
  roomId: null,
  capabilities: CAPABILITIES,
  details: {},
};

function commandOf(capability: CapabilityKey, value: JsonValue): DeviceCommand {
  return {
    commandId: '22222222-2222-4222-8222-222222222222',
    externalId: 'st-tv',
    capability,
    value,
  };
}

function directOf(capability: CapabilityKey, value: JsonValue): DeviceCommand {
  return { ...commandOf(capability, value), externalId: DEVICE_ID };
}

interface Rig {
  readonly routing: TelevisionRouting;
  readonly smartthings: ReturnType<typeof vi.fn<ProviderAdapter['execute']>>;
  readonly direct: ReturnType<typeof vi.fn<ProviderAdapter['execute']>>;
  readonly state: Map<string, JsonValue>;
  readonly running: Set<Provider>;
  attached: string | null;
}

function adapterOf(
  provider: Provider,
  execute: ReturnType<typeof vi.fn<ProviderAdapter['execute']>>,
): ProviderAdapter {
  return {
    provider,
    discover: () => Promise.resolve([]),
    subscribe: () => Promise.resolve(() => Promise.resolve()),
    execute,
    refresh: () => Promise.resolve([]),
  };
}

let rig: Rig;

beforeEach(() => {
  captureLogs();
  const smartthings = vi.fn<ProviderAdapter['execute']>(() => Promise.resolve(null));
  const direct = vi.fn<ProviderAdapter['execute']>(() => Promise.resolve(null));
  const state = new Map<string, JsonValue>([
    ['power', true],
    ['mute', false],
    [OCF, 'false'],
  ]);
  const running = new Set<Provider>(['smartthings', 'samsung_tv']);
  const adapters = {
    smartthings: adapterOf('smartthings', smartthings),
    samsung_tv: adapterOf('samsung_tv', direct),
  };
  const current: Rig = {
    smartthings,
    direct,
    state,
    running,
    attached: null,
    routing: new TelevisionRouting({
      adapters: {
        adapterFor: (provider) =>
          running.has(provider)
            ? Object.entries(adapters).find(([name]) => name === provider)?.[1]
            : undefined,
      },
      valueOf: (_device, capability) => state.get(capability),
      settingsOf: (deviceId) =>
        current.attached === deviceId
          ? {
              device_id: deviceId,
              direct_host: '192.168.1.40',
              direct_mac: 'a1:b2:c3:d4:e5:f6',
              input_names: {},
              wake_macs: [],
              wake_worked_at: null,
            }
          : undefined,
      wake: new TelevisionWake({
        wake: () => Promise.resolve(),
        settingsOf: () => undefined,
        woke: () => undefined,
        online: () => true,
        subscribe: () => () => undefined,
        clock: { now: () => new Date(), at: () => () => undefined, sleep: () => Promise.resolve() },
        log: testLogger('television'),
      }),
      log: testLogger('television'),
    }),
  };
  rig = current;
});

describe('which commands the television routing takes', () => {
  it('takes every remote key of a SmartThings television', () => {
    expect(rig.routing.handles(TV, commandOf('remote_key', 'up'))).toBe(true);
  });

  it('takes every power on, so a sleeping screen can be woken', () => {
    expect(rig.routing.handles(TV, commandOf('power', true))).toBe(true);
  });

  it('takes power off and apps only when that television has its own direct link', () => {
    expect(rig.routing.handles(TV, commandOf('power', false))).toBe(false);
    expect(rig.routing.handles(TV, commandOf('app_launch', 'YouTube'))).toBe(false);
    rig.attached = DEVICE_ID;
    expect(rig.routing.handles(TV, commandOf('power', false))).toBe(true);
    expect(rig.routing.handles(TV, commandOf('app_launch', 'YouTube'))).toBe(true);
    rig.running.delete('samsung_tv');
    expect(rig.routing.handles(TV, commandOf('power', false))).toBe(false);
    rig.running.add('samsung_tv');
    rig.attached = '33333333-3333-4333-8333-333333333333';
    expect(rig.routing.handles(TV, commandOf('power', false))).toBe(false);
  });

  it('turns on a screen SmartThings can reach through SmartThings when no link is attached', async () => {
    rig.state.set('power', false);
    await rig.routing.execute(TV, commandOf('power', true));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('power', true));
    expect(rig.direct).not.toHaveBeenCalled();
  });

  it('leaves other capabilities and other devices alone', () => {
    expect(rig.routing.handles(TV, commandOf('volume', 5))).toBe(false);
    expect(rig.routing.handles({ ...TV, kind: 'light' }, commandOf('remote_key', 'up'))).toBe(
      false,
    );
    expect(
      rig.routing.handles({ ...TV, provider: 'samsung_tv' }, commandOf('remote_key', 'up')),
    ).toBe(false);
  });
});

describe('pressing a remote key', () => {
  it('sends the pad through SmartThings when no direct link exists', async () => {
    await rig.routing.execute(TV, commandOf('remote_key', 'up'));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('remote_key', 'up'));
    expect(rig.direct).not.toHaveBeenCalled();
  });

  it('turns a canonical key into the action SmartThings has for it', async () => {
    await rig.routing.execute(TV, commandOf('remote_key', 'vol_up'));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('raw:audio_volume:volume_up', null));
  });

  it('toggles mute from the last known state', async () => {
    await rig.routing.execute(TV, commandOf('remote_key', 'mute'));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('mute', true));
  });

  it('refuses a key SmartThings cannot send and says how to fix it', async () => {
    await expect(rig.routing.execute(TV, commandOf('remote_key', 'n3'))).rejects.toThrow(
      new CommandRefusedError('remote_key', 'Needs a direct connection to the TV'),
    );
    expect(rig.smartthings).not.toHaveBeenCalled();
  });

  it('refuses every key while the television is off', async () => {
    rig.state.set('power', false);
    await expect(
      rig.routing.execute({ ...TV, online: false }, commandOf('remote_key', 'up')),
    ).rejects.toThrow(new CommandRefusedError('remote_key', 'Turn the TV on first'));
  });

  it('refuses a key it does not know', async () => {
    await expect(rig.routing.execute(TV, commandOf('remote_key', 'UP'))).rejects.toThrow(
      new CommandRefusedError('remote_key', 'not a known remote key'),
    );
  });

  it('sends a key over the direct link first, with the television protocol name', async () => {
    rig.attached = DEVICE_ID;
    await rig.routing.execute(TV, commandOf('remote_key', 'vol_up'));
    expect(rig.direct).toHaveBeenCalledWith(directOf('remote_key', 'KEY_VOLUP'));
    expect(rig.smartthings).not.toHaveBeenCalled();
    await rig.routing.execute(TV, commandOf('remote_key', 'n7'));
    expect(rig.direct).toHaveBeenLastCalledWith(directOf('remote_key', 'KEY_7'));
  });

  it('falls back to SmartThings once when the direct link fails, and says so in the log', async () => {
    const logs = captureLogs();
    rig.attached = DEVICE_ID;
    rig.direct.mockRejectedValueOnce(new Error('socket closed'));
    await rig.routing.execute(TV, commandOf('remote_key', 'vol_up'));
    expect(rig.direct).toHaveBeenCalledTimes(1);
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('raw:audio_volume:volume_up', null));
    expect(logs.events()).toContain('television.route_failed');
  });

  it('reports the last failure when every path fails', async () => {
    rig.attached = DEVICE_ID;
    rig.direct.mockRejectedValueOnce(new Error('socket closed'));
    rig.smartthings.mockRejectedValueOnce(new Error('cloud down'));
    await expect(rig.routing.execute(TV, commandOf('remote_key', 'vol_up'))).rejects.toThrow(
      'cloud down',
    );
  });

  it('fails when the provider that owns the chosen path is not running', async () => {
    rig.running.delete('smartthings');
    await expect(rig.routing.execute(TV, commandOf('remote_key', 'up'))).rejects.toThrow(
      new CommandRefusedError('remote_key', 'the smartthings provider is not running'),
    );
  });
});

describe('powering a television with a direct link', () => {
  beforeEach(() => {
    rig.attached = DEVICE_ID;
  });

  it('wakes a television SmartThings cannot wake through the direct link', async () => {
    rig.state.set('power', false);
    rig.state.set(OCF, 'true');
    const off = { ...TV, online: false };
    await rig.routing.execute(off, commandOf('power', true));
    expect(rig.direct).toHaveBeenCalledWith(directOf('power', true));
    expect(rig.smartthings).not.toHaveBeenCalled();
  });

  it('wakes through the direct link even when SmartThings could, and keeps SmartThings as backup', async () => {
    rig.state.set('power', false);
    rig.state.set(OCF, 'true');
    rig.direct.mockRejectedValueOnce(new Error('the screen did not turn on'));
    await rig.routing.execute(TV, commandOf('power', true));
    expect(rig.direct).toHaveBeenCalledWith(directOf('power', true));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('power', true));
  });

  it('turns the television off through the direct link', async () => {
    await rig.routing.execute(TV, commandOf('power', false));
    expect(rig.direct).toHaveBeenCalledWith(directOf('power', false));
  });
});

describe('opening an app on a television with a direct link', () => {
  beforeEach(() => {
    rig.attached = DEVICE_ID;
  });

  it('asks the direct link first', async () => {
    await rig.routing.execute(TV, commandOf('app_launch', 'YouTube'));
    expect(rig.direct).toHaveBeenCalledWith(directOf('app_launch', 'YouTube'));
    expect(rig.smartthings).not.toHaveBeenCalled();
  });

  it('falls back to the SmartThings catalogue when the television is not installed with it', async () => {
    rig.direct.mockRejectedValueOnce(
      new CommandRefusedError('app_launch', 'Plex is not installed'),
    );
    await rig.routing.execute(TV, commandOf('app_launch', 'Plex'));
    expect(rig.smartthings).toHaveBeenCalledWith(commandOf('app_launch', 'Plex'));
  });
});
