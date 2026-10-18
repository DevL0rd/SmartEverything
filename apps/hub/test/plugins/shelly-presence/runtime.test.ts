import { JSON_VALUE, type DeviceCommand } from '@smarteverything/domain';
import { SHELLY_SETTINGS } from '../../../src/plugins/builtin/shelly-presence/settings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginTool, ToolCaller } from '../../../src/plugins/builtin/contract';
import type { DeviceDriver } from '../../../src/local/device-driver';
import { startShelly } from '../../../src/plugins/builtin/shelly-presence/runtime';
import type { ShellyContext } from '../../../src/plugins/builtin/shelly-presence/settings';
import { testLogger } from '../../support/logs';
import {
  DEVICE_ID,
  FakeShelly,
  enrollmentAt,
  memoryRecords,
  memorySecrets,
  until,
  type RpcHandler,
} from './fake-shelly';
import { driverContext } from './harness';

vi.mock('../../../src/plugins/builtin/shelly-presence/discovery', () => ({
  discoverShelly: (): Promise<unknown> =>
    Promise.resolve({ available: true, reason: null, candidates: [] }),
  watchShelly: (): (() => Promise<void>) => () => Promise.resolve(),
}));

const OWNER: ToolCaller = {
  profileId: 'person-1',
  role: 'owner',
  chatId: null,
  via: 'app',
  clientId: 'client-1',
};
const SENSOR = `shelly-presence:${DEVICE_ID}`;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type GoneListener = (clientId: string) => void;
type ViewListener = (viewed: boolean) => void;

async function running(paused = false): Promise<{
  readonly clientGone: (clientId: string) => void;
  readonly view: (viewed: boolean) => void;
  readonly shelly: FakeShelly;
  readonly tools: readonly PluginTool[];
  readonly driver: DeviceDriver;
  readonly forgotten: string[][];
  readonly secrets: ReturnType<typeof memorySecrets>;
  readonly records: (collection: string) => ReturnType<typeof memoryRecords>;
}> {
  const shelly = await FakeShelly.open();
  const collections = new Map<string, ReturnType<typeof memoryRecords>>();
  const records = (collection: string): ReturnType<typeof memoryRecords> => {
    const known = collections.get(collection) ?? memoryRecords();
    collections.set(collection, known);
    return known;
  };
  records('enrollments').put(DEVICE_ID, JSON_VALUE.parse(enrollmentAt(shelly.address)));
  const tools: PluginTool[] = [];
  const gone: GoneListener[] = [];
  const viewers = new Map<string, ViewListener>();
  const drivers: DeviceDriver[] = [];
  const secrets = memorySecrets();
  const ctx: ShellyContext = {
    records,
    secrets,
    tools: { register: (added): void => void tools.push(...added) },
    devices: {
      register: (driver) => {
        drivers.push(driver);
        return (): void => undefined;
      },
      command: () => Promise.reject(new Error('the plugin runs its own commands')),
    },
    data: { publish: vi.fn() },
    search: { replace: vi.fn() },
    settings: SHELLY_SETTINGS.parse({ paused }),
    settingsChanged: () => (): void => undefined,
    clients: {
      gone: (listener) => {
        gone.push(listener);
        return (): void => {
          gone.splice(gone.indexOf(listener), 1);
        };
      },
    },
    viewers: {
      watchDevice: (externalId, onChange) => {
        viewers.set(externalId, onChange);
        return (): void => {
          viewers.delete(externalId);
        };
      },
    },
    signal: new AbortController().signal,
    log: testLogger('shelly'),
  };
  const stop = await startShelly(ctx);
  cleanups.push(async () => {
    await stop();
    await shelly.close();
  });
  const fixture = driverContext(vi.fn(), []);
  const [driver] = drivers;
  if (driver === undefined) throw new Error('no driver registered');
  const stopDriver = await driver.start(fixture.context);
  cleanups.push(stopDriver);
  const clientGone = (clientId: string): void => {
    for (const listener of gone) listener(clientId);
  };
  const view = (viewed: boolean): void => {
    viewers.get(SENSOR)?.(viewed);
  };
  return {
    shelly,
    clientGone,
    view,
    tools,
    driver,
    forgotten: fixture.forgotten,
    secrets,
    records,
  };
}

async function call(
  tools: readonly PluginTool[],
  name: string,
  input: Record<string, unknown>,
): Promise<Readonly<Record<string, unknown>>> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return (await tool.run(input, OWNER)).response;
}

async function online(tools: readonly PluginTool[]): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!JSON.stringify(await call(tools, 'read', {})).includes('"state":"online"')) {
    if (Date.now() > deadline) throw new Error('The sensor did not come online.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Shelly runtime', () => {
  it('connects the enrolled sensor and serves it through the tools', async () => {
    const { tools } = await running();
    await online(tools);
    const read = await call(tools, 'read', { externalId: SENSOR });
    expect(read).toMatchObject({ device: { id: DEVICE_ID, name: 'Hall radar' } });
  });

  it('runs an operation on the sensor', async () => {
    const { tools, shelly } = await running();
    await online(tools);
    const outcome = await call(tools, 'operate', {
      externalId: SENSOR,
      action: 'set_presence',
      params: { config: { enable: false } },
    });
    expect(outcome).toMatchObject({ state: 'accepted' });
    expect(shelly.calls.some((entry) => entry.method === 'Presence.SetConfig')).toBe(true);
  });

  it('runs a device command from the generic device pipeline', async () => {
    const { driver, tools, shelly } = await running();
    await online(tools);
    const command: DeviceCommand = {
      commandId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
      externalId: SENSOR,
      capability: 'raw:shelly.detection_enabled',
      value: false,
    };
    await driver.execute(command);
    expect(shelly.calls.find((entry) => entry.method === 'Presence.SetSensor')?.params).toEqual({
      enable: false,
    });
  });

  it('stops tracking held by an app when that app goes away', async () => {
    const { tools, shelly, clientGone } = await running();
    await online(tools);
    shelly.handler = (method): ReturnType<RpcHandler> =>
      method === 'Presence.GetStatus'
        ? {
            live_track: { timer_started_at: Date.now() / 1000, timer_duration: 300, interval: 1 },
          }
        : undefined;
    const tracking = (enable: boolean): number =>
      shelly.calls.filter(
        (entry) =>
          entry.method === 'Presence.LiveTrack' &&
          JSON.stringify(entry.params) === `{"enable":${String(enable)}}`,
      ).length;
    await call(tools, 'set_live_view', { externalId: SENSOR, enabled: true });
    expect(tracking(true)).toBe(1);
    clientGone('another-client');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tracking(false)).toBe(0);
    clientGone(OWNER.clientId ?? '');
    await until(() => tracking(false) === 1, 'tracking to stop for the departed app');
  });

  it('tracks while a screen watches the sensor and stops when the last watcher leaves', async () => {
    const { tools, shelly, view } = await running();
    await online(tools);
    shelly.handler = (method): ReturnType<RpcHandler> =>
      method === 'Presence.GetStatus'
        ? {
            live_track: { timer_started_at: Date.now() / 1000, timer_duration: 300, interval: 1 },
          }
        : undefined;
    const tracking = (enable: boolean): number =>
      shelly.calls.filter(
        (entry) =>
          entry.method === 'Presence.LiveTrack' &&
          JSON.stringify(entry.params) === `{"enable":${String(enable)}}`,
      ).length;
    view(true);
    await until(() => tracking(true) === 1, 'tracking to start for the watcher');
    expect(tracking(false)).toBe(0);
    view(false);
    await until(() => tracking(false) === 1, 'tracking to stop when nobody watches');
  });

  it('keeps tracking for an automation after the last screen stops watching', async () => {
    const { tools, shelly, view } = await running();
    await online(tools);
    shelly.handler = (method): ReturnType<RpcHandler> =>
      method === 'Presence.GetStatus'
        ? {
            live_track: { timer_started_at: Date.now() / 1000, timer_duration: 300, interval: 1 },
          }
        : undefined;
    const stopped = (): number =>
      shelly.calls.filter(
        (entry) =>
          entry.method === 'Presence.LiveTrack' &&
          JSON.stringify(entry.params) === '{"enable":false}',
      ).length;
    await call(tools, 'set_live_view', { externalId: SENSOR, enabled: true, holder: 'automation' });
    view(true);
    view(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped()).toBe(0);
  });

  it('forgets a sensor with its records and device targets', async () => {
    const { tools, records, forgotten } = await running();
    await online(tools);
    expect(await call(tools, 'forget', { externalId: SENSOR })).toEqual({ removed: true });
    expect(records('enrollments').list()).toEqual([]);
    expect(records('snapshots').list()).toEqual([]);
    expect(forgotten.flat()).toContain(SENSOR.slice('shelly-presence:'.length));
    expect(JSON.stringify(await call(tools, 'read', {}))).not.toContain(DEVICE_ID);
  });

  it('does not open a connection while the plugin is paused', async () => {
    const { shelly, tools } = await running(true);
    const read = await call(tools, 'read', { externalId: SENSOR });
    expect(read).toMatchObject({ device: { connection: { state: 'paused' } } });
    expect(shelly.calls).toEqual([]);
  });
});
