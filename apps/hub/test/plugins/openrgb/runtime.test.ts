import {
  CommandRefusedError,
  type CapabilityKey,
  type DeviceCommand,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import type { DeviceDriver } from '../../../src/local/device-driver';
import type { PluginRecords, PluginStop, PluginTool } from '../../../src/plugins/builtin/contract';
import {
  OpenRgbRuntime,
  type OpenRgbHost,
  type OpenRgbOptions,
} from '../../../src/plugins/builtin/openrgb/runtime';
import type { Rgb } from '../../../src/plugins/builtin/openrgb/colour-math';
import { testLogger } from '../../support/logs';
import { memoryRecords } from '../memory-records';
import {
  OFF,
  board,
  fakeServer,
  recordDriver,
  strip,
  type DriverRecording,
  type FakeLink,
  type FakeServer,
  type LinkCall,
} from './fake-openrgb';

const STRIP_ID = 'openrgb:acme-fake-strip-serial-1';
const BOARD_ID = 'openrgb:acme-fake-board-i2c-bus-1';
const OWNER: ToolCaller = {
  profileId: '1',
  role: 'owner',
  chatId: null,
  via: 'app',
  clientId: null,
};
const MEMBER: ToolCaller = { ...OWNER, profileId: '2', role: 'member' };

interface Pause {
  readonly milliseconds: number;
  readonly release: () => void;
}

interface Fixture {
  readonly server: FakeServer;
  readonly drivers: DeviceDriver[];
  readonly tools: PluginTool[];
  readonly pauses: Pause[];
  readonly lifetime: AbortController;
  readonly driver: DriverRecording;
  readonly runtime: OpenRgbRuntime;
}

let fixture: Fixture;
let stopRuntime: PluginStop;
let stopDriver: PluginStop;

const noStop: PluginStop = () => Promise.resolve();

function launch(server: FakeServer, records: PluginRecords = memoryRecords()): Fixture {
  const drivers: DeviceDriver[] = [];
  const tools: PluginTool[] = [];
  const pauses: Pause[] = [];
  const lifetime = new AbortController();
  const host: OpenRgbHost = {
    settings: { host: '127.0.0.1', port: 6742 },
    signal: lifetime.signal,
    log: testLogger('openrgb'),
    tools: {
      register: (registered): void => {
        tools.splice(0, tools.length, ...registered);
      },
    },
    records: () => records,
    devices: {
      register: (driver) => {
        drivers.push(driver);
        return () => undefined;
      },
    },
  };
  const options: OpenRgbOptions = {
    connect: server.connector,
    pause: (milliseconds, signal) =>
      new Promise<void>((resolve, reject) => {
        pauses.push({ milliseconds, release: resolve });
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
  };
  return {
    server,
    drivers,
    tools,
    pauses,
    lifetime,
    driver: recordDriver(lifetime.signal),
    runtime: new OpenRgbRuntime(host, options),
  };
}

async function begin(server: FakeServer, records?: PluginRecords): Promise<void> {
  fixture = launch(server, records);
  stopRuntime = fixture.runtime.start();
  const [driver] = fixture.drivers;
  if (driver === undefined) throw new Error('The OpenRGB plugin registered no device driver.');
  stopDriver = await driver.start(fixture.driver.context);
}

async function startPlugin(server: FakeServer, records?: PluginRecords): Promise<void> {
  await begin(server, records);
  await vi.waitFor(() => {
    expect(fixture.driver.devices.length).toBeGreaterThan(0);
  });
}

function link(): FakeLink {
  const [first] = fixture.server.links;
  if (first === undefined) throw new Error('The plugin never connected.');
  return first;
}

function command(
  externalId: string,
  capability: CapabilityKey,
  value: DeviceCommand['value'],
): DeviceCommand {
  return { commandId: 'test-command', externalId, capability, value };
}

function leds(colour: Rgb): LinkCall {
  return { kind: 'leds', controller: 0, colours: [colour, colour, colour, colour] };
}

function execute(request: DeviceCommand): Promise<unknown> {
  const [driver] = fixture.drivers;
  if (driver === undefined) throw new Error('No driver.');
  return driver.execute(request);
}

function latest(externalId: string, capability: string): unknown {
  return fixture.driver.states.findLast(
    (update) => update.externalId === externalId && update.capability === capability,
  )?.value;
}

function lastDevice(externalId: string): { online: boolean } | undefined {
  return fixture.driver.devices.flat().findLast((device) => device.externalId === externalId);
}

function errorOf(result: { readonly response: Readonly<Record<string, unknown>> }): string {
  return String(result.response['error']);
}

function tool(name: string): PluginTool {
  const found = fixture.tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`No tool named ${name}.`);
  return found;
}

afterEach(async () => {
  await stopDriver();
  await stopRuntime();
});

describe('OpenRGB plugin lights', () => {
  beforeEach(async () => {
    await startPlugin(fakeServer(() => [strip(), board()]));
    await vi.waitFor(() => {
      expect(latest(STRIP_ID, 'power')).toBe(true);
    });
  });

  it('publishes each controller as a light with colour, brightness, power and effect', () => {
    const device = fixture.driver.devices.flat().find((entry) => entry.externalId === STRIP_ID);
    expect(device).toMatchObject({
      kind: 'light',
      name: 'Fake strip',
      model: 'Fake strip',
      manufacturer: 'Acme',
      online: true,
      parentExternalId: null,
    });
    expect(device?.capabilities.map((capability) => capability.key)).toEqual([
      'power',
      'brightness',
      'color',
      'light_effect',
    ]);
    expect(latest(STRIP_ID, 'color')).toEqual({ hue: 0, saturation: 100, value: 100 });
    expect(latest(STRIP_ID, 'brightness')).toBe(100);
    expect(latest(STRIP_ID, 'light_effect')).toBe('Direct');
  });

  it('gives a controller with several zones one light for the whole device and one per zone', () => {
    const ids = fixture.driver.devices
      .flat()
      .map((device) => [device.externalId, device.parentExternalId]);
    expect(ids).toEqual(
      expect.arrayContaining([
        [BOARD_ID, null],
        [`${BOARD_ID}-zone-0`, BOARD_ID],
        [`${BOARD_ID}-zone-1`, BOARD_ID],
      ]),
    );
    expect(latest(BOARD_ID, 'power')).toBe(false);
  });

  it('writes a colour to every LED and publishes the new state', async () => {
    await execute(command(STRIP_ID, 'color', { hue: 120, saturation: 100, value: 100 }));
    expect(link().calls).toEqual([
      {
        kind: 'leds',
        controller: 0,
        colours: Array.from({ length: 4 }, () => ({ red: 0, green: 255, blue: 0 })),
      },
    ]);
    expect(latest(STRIP_ID, 'color')).toEqual({ hue: 120, saturation: 100, value: 100 });
  });

  it('scales the colour for brightness and reports the brightness it was given', async () => {
    await execute(command(STRIP_ID, 'brightness', 50));
    expect(link().calls[0]).toMatchObject({
      kind: 'leds',
      colours: [
        { red: 128, green: 0, blue: 0 },
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ],
    });
    expect(latest(STRIP_ID, 'brightness')).toBe(50);
    await execute(command(STRIP_ID, 'brightness', 100));
    expect(link().calls[1]).toEqual(leds({ red: 255, green: 0, blue: 0 }));
  });

  it('turns off by writing black and restores the last colour when turned on again', async () => {
    await execute(command(STRIP_ID, 'color', { hue: 240, saturation: 100, value: 100 }));
    await execute(command(STRIP_ID, 'power', false));
    expect(link().calls[1]).toMatchObject({ kind: 'leds', colours: [OFF, OFF, OFF, OFF] });
    expect(latest(STRIP_ID, 'power')).toBe(false);
    await execute(command(STRIP_ID, 'power', true));
    expect(link().calls[2]).toEqual(leds({ red: 0, green: 0, blue: 255 }));
    expect(latest(STRIP_ID, 'power')).toBe(true);
  });

  it('treats a colour with no brightness as turning off', async () => {
    await execute(command(STRIP_ID, 'color', { hue: 10, saturation: 10, value: 0 }));
    expect(link().calls[0]).toMatchObject({ colours: [OFF, OFF, OFF, OFF] });
    expect(latest(STRIP_ID, 'power')).toBe(false);
  });

  it('switches to the mode that takes a colour before colouring a light running an effect', async () => {
    await execute(command(STRIP_ID, 'light_effect', 'Rainbow'));
    expect(link().calls).toEqual([{ kind: 'mode', controller: 0, mode: 'Rainbow', colours: null }]);
    await execute(command(STRIP_ID, 'power', false));
    expect(link().calls.slice(1)).toEqual([
      { kind: 'mode', controller: 0, mode: 'Direct', colours: null },
      { kind: 'leds', controller: 0, colours: [OFF, OFF, OFF, OFF] },
    ]);
    expect(latest(STRIP_ID, 'light_effect')).toBe('Direct');
  });

  it('colours a mode that holds one colour through the mode itself', async () => {
    await execute(command(STRIP_ID, 'light_effect', 'Static'));
    expect(link().calls[0]).toEqual({
      kind: 'mode',
      controller: 0,
      mode: 'Static',
      colours: [{ red: 255, green: 0, blue: 0 }],
    });
    await execute(command(STRIP_ID, 'color', { hue: 120, saturation: 100, value: 100 }));
    expect(link().calls[1]).toEqual({
      kind: 'mode',
      controller: 0,
      mode: 'Static',
      colours: [{ red: 0, green: 255, blue: 0 }],
    });
  });

  it('writes only the zone of a zone light', async () => {
    await execute(command(`${BOARD_ID}-zone-1`, 'color', { hue: 0, saturation: 0, value: 100 }));
    expect(link().calls).toEqual([
      {
        kind: 'zone',
        controller: 1,
        zone: 1,
        colours: [
          { red: 255, green: 255, blue: 255 },
          { red: 255, green: 255, blue: 255 },
        ],
      },
    ]);
    expect(latest(`${BOARD_ID}-zone-1`, 'power')).toBe(true);
    expect(latest(`${BOARD_ID}-zone-0`, 'power')).toBe(false);
    expect(latest(BOARD_ID, 'power')).toBe(true);
  });

  it('refuses controls a light does not have and values outside them', async () => {
    await expect(
      execute(command(`${BOARD_ID}-zone-0`, 'light_effect', 'Direct')),
    ).rejects.toBeInstanceOf(CommandRefusedError);
    await expect(execute(command(STRIP_ID, 'brightness', 0))).rejects.toThrow(/outside 1 to 100/);
    await expect(execute(command(STRIP_ID, 'light_effect', 'Disco'))).rejects.toThrow(/not one of/);
    await expect(execute(command('openrgb:unknown', 'power', true))).rejects.toBeInstanceOf(
      CommandRefusedError,
    );
    expect(link().calls).toEqual([]);
  });

  it('adds a light when the server announces a new device and marks a removed one offline', async () => {
    link().announceListChange([
      strip(),
      board(),
      strip({ name: 'Second strip', serial: 'SERIAL-2' }),
    ]);
    await vi.waitFor(() => {
      expect(lastDevice('openrgb:acme-second-strip-serial-2')?.online).toBe(true);
    });
    link().announceListChange([board()]);
    await vi.waitFor(() => {
      expect(lastDevice(STRIP_ID)?.online).toBe(false);
    });
    await expect(execute(command(STRIP_ID, 'power', true))).rejects.toBeInstanceOf(
      CommandRefusedError,
    );
    expect(lastDevice(BOARD_ID)?.online).toBe(true);
  });
});

describe('OpenRGB plugin connection', () => {
  it('marks every light offline when the server goes away and reconnects after the backoff', async () => {
    await startPlugin(fakeServer(() => [strip()]));
    link().dropped();
    await vi.waitFor(() => {
      expect(lastDevice(STRIP_ID)?.online).toBe(false);
      expect(fixture.pauses.map((pause) => pause.milliseconds)).toEqual([1000]);
    });
    await expect(execute(command(STRIP_ID, 'power', true))).rejects.toBeInstanceOf(
      CommandRefusedError,
    );
    fixture.pauses[0]?.release();
    await vi.waitFor(() => {
      expect(fixture.server.links).toHaveLength(2);
      expect(lastDevice(STRIP_ID)?.online).toBe(true);
    });
  });

  it('waits longer after every refused connection and connects as soon as the server is back', async () => {
    const server = fakeServer(() => [strip()]);
    server.refuse(new Error('connect ECONNREFUSED'));
    await begin(server);
    await vi.waitFor(() => {
      expect(fixture.pauses).toHaveLength(1);
    });
    fixture.pauses[0]?.release();
    await vi.waitFor(() => {
      expect(fixture.pauses.map((pause) => pause.milliseconds)).toEqual([1000, 2000]);
    });
    server.refuse(null);
    fixture.pauses[1]?.release();
    await vi.waitFor(() => {
      expect(server.links).toHaveLength(1);
    });
    expect(server.attempts()).toBe(3);
  });

  it('closes a connection whose device list cannot be read and reconnects', async () => {
    const server = fakeServer(
      () => [strip()],
      (created, attempt) => {
        if (attempt === 1)
          created.failReads(new Error('The OpenRGB server closed the connection.'));
      },
    );
    await begin(server);
    await vi.waitFor(() => {
      expect(fixture.pauses).toHaveLength(1);
    });
    expect(server.links[0]?.closed).toBe(true);
  });

  it('remembers the last colour of a light that was off across a restart', async () => {
    const records = memoryRecords();
    await startPlugin(
      fakeServer(() => [strip()]),
      records,
    );
    await execute(command(STRIP_ID, 'color', { hue: 240, saturation: 100, value: 100 }));
    await execute(command(STRIP_ID, 'power', false));
    await stopDriver();
    await stopRuntime();
    await startPlugin(
      fakeServer(() => [strip({ colors: [OFF, OFF, OFF, OFF] })]),
      records,
    );
    await vi.waitFor(() => {
      expect(latest(STRIP_ID, 'power')).toBe(false);
    });
    await execute(command(STRIP_ID, 'power', true));
    expect(link().calls).toEqual([leds({ red: 0, green: 0, blue: 255 })]);
  });

  it('closes the connection and stops reconnecting when the plugin stops', async () => {
    await startPlugin(fakeServer(() => [strip()]));
    const current = link();
    await stopDriver();
    await stopRuntime();
    expect(current.closed).toBe(true);
    stopRuntime = noStop;
    stopDriver = noStop;
    expect(fixture.server.attempts()).toBe(1);
  });
});

describe('OpenRGB plugin profiles', () => {
  beforeEach(async () => {
    await startPlugin(fakeServer(() => [strip()]));
  });

  it('reports the lights and the saved profiles', async () => {
    const result = await tool('status').run({}, OWNER);
    expect(result.response).toMatchObject({
      connected: true,
      profiles: ['Evening'],
      lights: [{ externalId: STRIP_ID, name: 'Fake strip', on: true, effect: 'Direct' }],
    });
  });

  it('loads a saved profile and shows what it changed', async () => {
    link().controllerList = [strip({ colors: [OFF, OFF, OFF, OFF] })];
    const result = await tool('load_profile').run({ name: 'Evening' }, MEMBER);
    expect(result.response).toEqual({ loaded: 'Evening' });
    expect(link().calls).toEqual([{ kind: 'load', name: 'Evening' }]);
    await vi.waitFor(() => {
      expect(latest(STRIP_ID, 'power')).toBe(false);
    });
  });

  it('names the profiles that exist when asked for one that does not', async () => {
    const result = await tool('load_profile').run({ name: 'Missing' }, OWNER);
    expect(errorOf(result)).toContain('It has: Evening');
    expect(link().calls).toEqual([]);
  });

  it('lets only the owner save a profile', async () => {
    const refused = await tool('save_profile').run({ name: 'Night' }, MEMBER);
    expect(errorOf(refused)).toContain('owner');
    expect(link().calls).toEqual([]);
    const saved = await tool('save_profile').run({ name: 'Night' }, OWNER);
    expect(saved.response).toEqual({ saved: 'Night' });
    expect(link().calls).toEqual([{ kind: 'save', name: 'Night' }]);
  });

  it('refuses profile names that could reach outside OpenRGB’s profile folder', () => {
    for (const name of ['../etc/passwd', 'a/b', '.hidden', '', 'x'.repeat(65)]) {
      expect(tool('save_profile').validate({ name })).not.toBeNull();
    }
    expect(tool('save_profile').validate({ name: 'Gaming night-2' })).toBeNull();
  });
});
