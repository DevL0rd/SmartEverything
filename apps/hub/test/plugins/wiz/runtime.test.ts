import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WizInterface } from '../../../src/plugins/builtin/wiz/interfaces';
import { WizRuntime, type WizHost } from '../../../src/plugins/builtin/wiz/runtime';
import type { DeviceDriver } from '../../../src/local/device-driver';
import type { PluginRecords, PluginStop } from '../../../src/plugins/builtin/contract';
import { testLogger } from '../../support/logs';
import { memoryRecords } from '../memory-records';
import { BULB_MAC, FakeBulb, FakeNetwork, recordDriver, type DriverRecording } from './fake-wiz';

const PUSH_PORT = 38900;
const LOOPBACK: readonly WizInterface[] = [
  { address: '127.0.0.1', prefix: 8, broadcast: '127.0.0.1' },
];
const EXTERNAL_ID = `wiz:${BULB_MAC}`;

interface Fixture {
  readonly bulb: FakeBulb;
  readonly network: FakeNetwork;
  readonly records: PluginRecords;
  readonly puts: string[];
  readonly drivers: DeviceDriver[];
  readonly lifetime: AbortController;
  readonly driver: DriverRecording;
  readonly runtime: WizRuntime;
}

let fixture: Fixture;
let stopRuntime: PluginStop;
let stopDriver: PluginStop;

function launch(bulb: FakeBulb, records: PluginRecords): Fixture {
  const network = new FakeNetwork();
  const puts: string[] = [];
  const drivers: DeviceDriver[] = [];
  const lifetime = new AbortController();
  const host: WizHost = {
    signal: lifetime.signal,
    log: testLogger('wiz'),
    tools: { register: () => undefined },
    records: (): PluginRecords => ({
      ...records,
      put: (key, value): void => {
        puts.push(key);
        records.put(key, value);
      },
    }),
    network,
    devices: {
      register: (driver) => {
        drivers.push(driver);
        return () => undefined;
      },
    },
  };
  const runtime = new WizRuntime(host, {
    ports: { control: bulb.port, push: PUSH_PORT },
    interfaces: (): readonly WizInterface[] => LOOPBACK,
  });
  return {
    bulb,
    network,
    records,
    puts,
    drivers,
    lifetime,
    driver: recordDriver(lifetime.signal),
    runtime,
  };
}

async function startPlugin(): Promise<void> {
  stopRuntime = await fixture.runtime.start();
  const [driver] = fixture.drivers;
  if (driver === undefined) throw new Error('The WiZ plugin registered no device driver.');
  stopDriver = await driver.start(fixture.driver.context);
}

async function attachedAndDiscovered(): Promise<void> {
  await startPlugin();
  await vi.waitFor(() => {
    expect(fixture.puts.length).toBeGreaterThanOrEqual(4);
    expect(fixture.driver.states.some((update) => update.capability === 'brightness')).toBe(true);
  });
}

beforeEach(async () => {
  fixture = launch(await FakeBulb.start(), memoryRecords());
  await attachedAndDiscovered();
});

afterEach(async () => {
  await stopDriver();
  await stopRuntime();
  fixture.bulb.close();
});

describe('WiZ plugin', () => {
  it('finds a light on any local network, names it and publishes its controls', () => {
    const device = fixture.driver.published.at(-1)?.[0];
    expect(device).toMatchObject({
      externalId: EXTERNAL_ID,
      name: 'WiZ colour light 3ABC',
      model: 'ESP01_SHRGB_03',
      online: true,
    });
    expect(device?.capabilities.map((capability) => capability.key)).toContain('color');
    const readings = Object.fromEntries(
      fixture.driver.states.map((update) => [update.capability, update.value]),
    );
    expect(readings).toMatchObject({ power: true, brightness: 60 });
    expect(fixture.puts.every((key) => key === BULB_MAC)).toBe(true);
  });

  it('subscribes to the light so it can push its changes', () => {
    const registration = fixture.bulb.received.find(
      (entry) => entry.method === 'registration' && entry.params['register'] === true,
    );
    expect(registration?.params).toMatchObject({ phoneIp: '127.0.0.1', register: true });
  });

  it('follows pushed changes without writing the database', async () => {
    const writes = fixture.puts.length;
    const push = fixture.network.portOf(PUSH_PORT);
    fixture.bulb.push(push, { rssi: -70 });
    fixture.bulb.push(push, { rssi: -72 });
    fixture.bulb.push(push, { dimming: 85, rssi: -71 });
    await vi.waitFor(() => {
      expect(
        fixture.driver.states.filter((update) => update.capability === 'brightness').at(-1)?.value,
      ).toBe(85);
    });
    expect(fixture.puts).toHaveLength(writes);
  });

  it('sends a control to the light and reads its state back', async () => {
    const driver = fixture.drivers[0];
    const result = await driver?.execute({
      commandId: 'command-1',
      externalId: EXTERNAL_ID,
      capability: 'brightness',
      value: 30,
    });
    expect(result).toEqual({ success: true });
    const methods = fixture.bulb.received.map((entry) => entry.method);
    const set = methods.lastIndexOf('setPilot');
    expect(fixture.bulb.received[set]?.params).toEqual({ dimming: 30 });
    expect(methods[set + 1]).toBe('getPilot');
  });

  it('refuses a control for a light it does not know', async () => {
    await expect(
      fixture.drivers[0]?.execute({
        commandId: 'command-2',
        externalId: 'wiz:000000000000',
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow('this WiZ light is not available');
  });

  it('marks its lights unavailable and unsubscribes when it stops', async () => {
    const unsubscribes = (): number =>
      fixture.bulb.received.filter(
        (entry) => entry.method === 'registration' && entry.params['register'] === false,
      ).length;
    const before = unsubscribes();
    await stopRuntime();
    expect(fixture.driver.published.at(-1)?.[0]?.online).toBe(false);
    await vi.waitFor(() => {
      expect(unsubscribes()).toBe(before + 1);
    });
  });

  it('remembers a light after a restart and waits to hear from it before reporting a state', async () => {
    await stopDriver();
    await stopRuntime();
    fixture.bulb.ignoring = Number.MAX_SAFE_INTEGER;
    const restarted = launch(fixture.bulb, fixture.records);
    fixture = restarted;
    await startPlugin();
    await vi.waitFor(() => {
      expect(restarted.driver.published.at(-1)?.[0]).toMatchObject({
        externalId: EXTERNAL_ID,
        online: false,
      });
    });
    expect(restarted.driver.states).toHaveLength(0);
  });
});
