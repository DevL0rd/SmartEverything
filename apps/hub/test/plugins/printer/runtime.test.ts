import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRINTER_KEYS, type PluginEvent, type PluginSearchEntry } from '@smarteverything/domain';
import type { DeviceDriver } from '../../../src/local/device-driver';
import type { PluginStop, PluginTool } from '../../../src/plugins/builtin/contract';
import { PrinterClient } from '../../../src/plugins/builtin/printer/client';
import type { Converter } from '../../../src/plugins/builtin/printer/convert';
import {
  PrinterRuntime,
  type PrinterPluginHost,
  type RuntimeOptions,
} from '../../../src/plugins/builtin/printer/runtime';
import { MemoryNetwork } from '../../support/memory-mdns';
import { recordDriver, type DriverRecording } from '../wiz/fake-wiz';
import { DEFAULT_OPERATIONS, FakeIppPrinter } from './fake-ipp-printer';
import { OPERATION } from '@smarteverything/ipp';
import { newRig, type Rig } from './rig';
import { OWNER } from './service-rig';

const STUB: Converter = {
  pdfToRaster: () => Promise.resolve(Uint8Array.of(1)),
  imageToRaster: () => Promise.resolve(Uint8Array.of(1)),
  imageToJpeg: () => Promise.resolve(Uint8Array.of(1)),
};

interface Fixture {
  readonly rig: Rig;
  readonly printer: FakeIppPrinter;
  readonly folder: string;
  readonly tools: PluginTool[];
  readonly drivers: DeviceDriver[];
  readonly searches: PluginSearchEntry[][];
  readonly events: PluginEvent[];
}

let fixture: Fixture;
let stopRuntime: PluginStop | null = null;
let stopDriver: PluginStop | null = null;
let recording: DriverRecording;

function hostOf(current: Fixture): PrinterPluginHost {
  const { rig } = current;
  return {
    log: rig.host.log,
    signal: rig.host.signal,
    records: rig.host.records,
    secrets: rig.host.secrets,
    viewers: rig.host.viewers,
    metrics: rig.host.metrics,
    events: {
      emit: (event): void => {
        current.events.push(event);
      },
    },
    devices: {
      register: (driver): (() => void) => {
        current.drivers.push(driver);
        return (): void => undefined;
      },
      command: () => Promise.resolve(null),
    },
    tools: {
      register: (tools): void => {
        current.tools.push(...tools);
      },
    },
    search: {
      replace: (entries): void => {
        current.searches.push([...entries]);
      },
    },
    files: {
      folder: current.folder,
      outbox: current.folder,
      attachmentsOf: (): readonly string[] => [],
      fromUpload: () => Promise.resolve(null),
      fromMachine: () => Promise.resolve(null),
    },
    home: {
      timeZone: (): string => 'UTC',
      profiles: () => [],
      phone: () => ({ paired: false, place: null }),
    },
  };
}

function optionsOf(network: MemoryNetwork): RuntimeOptions {
  return {
    openMdns: network.host('192.0.2.2'),
    openClient: (setup) => new PrinterClient(setup),
    converter: () => STUB,
    now: () => new Date('2026-10-18T10:00:00.000Z'),
  };
}

async function launch(current: Fixture, network = new MemoryNetwork()): Promise<void> {
  current.tools.splice(0);
  current.drivers.splice(0);
  stopRuntime = await new PrinterRuntime(hostOf(current), optionsOf(network)).start();
  const [driver] = current.drivers;
  if (driver === undefined) throw new Error('The printer plugin registered no device driver.');
  recording = recordDriver(current.rig.host.signal);
  stopDriver = await driver.start(recording.context);
}

async function shutdown(): Promise<void> {
  await stopDriver?.();
  await stopRuntime?.();
  stopDriver = null;
  stopRuntime = null;
}

function tool(name: string): PluginTool {
  const found = fixture.tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`The plugin registered no ${name} tool.`);
  return found;
}

beforeEach(async () => {
  const printer = new FakeIppPrinter({
    operations: [...DEFAULT_OPERATIONS, OPERATION.pausePrinter, OPERATION.resumePrinter],
  });
  await printer.start();
  fixture = {
    rig: newRig(),
    printer,
    folder: await mkdtemp(join(tmpdir(), 'printer-runtime-')),
    tools: [],
    drivers: [],
    searches: [],
    events: [],
  };
  await launch(fixture);
});

afterEach(async () => {
  await shutdown();
  await fixture.printer.stop();
  await rm(fixture.folder, { recursive: true, force: true });
});

async function add(): Promise<string> {
  const result = await tool('printer_action').run(
    { action: 'add', uri: fixture.printer.url, name: 'Hall' },
    OWNER,
  );
  expect(result.response['status']).toBe('added');
  return `printer:${fixture.printer.state.uuid}`;
}

describe('printer plugin runtime', () => {
  it('registers the read tool, the action tool and one device driver', () => {
    expect(fixture.tools.map((entry) => entry.name)).toStrictEqual(['printer', 'printer_action']);
    expect(fixture.drivers.map((driver) => driver.id)).toStrictEqual(['printer']);
  });

  it('adds a printer, publishes it as a device and puts it in search', async () => {
    await add();
    await vi.waitFor(() => {
      expect(recording.states.some((update) => update.capability === 'raw:printer.state')).toBe(
        true,
      );
    });
    const entries = fixture.searches.at(-1) ?? [];
    expect(entries.map((entry) => entry.title)).toContain('Hall · Supplies');
    expect(entries.every((entry) => entry.target.kind === 'device')).toBe(true);
  });

  it('prints a test page, identifies and pauses the queue through the device driver', async () => {
    const externalId = await add();
    const [driver] = fixture.drivers;
    const command = (
      capability: Parameters<DeviceDriver['execute']>[0]['capability'],
      value: string | null,
    ): Parameters<DeviceDriver['execute']>[0] => ({
      commandId: `c-${capability}`,
      externalId,
      capability,
      value,
    });
    const printed = z
      .object({ printed: z.string() })
      .parse(await driver?.execute(command(PRINTER_KEYS.testPage, null)));
    expect(printed.printed).not.toBe('');
    expect(await driver?.execute(command(PRINTER_KEYS.identify, null))).toStrictEqual({
      identifying: true,
    });
    expect(await driver?.execute(command(PRINTER_KEYS.queue, 'paused'))).toStrictEqual({
      queue: 'paused',
    });
    expect(fixture.printer.state.reasons).toContain('paused');
  });

  it('refuses a printer it does not know and a control it does not have', async () => {
    const externalId = await add();
    const [driver] = fixture.drivers;
    await expect(
      driver?.execute({
        commandId: 'c1',
        externalId: 'printer:none',
        capability: PRINTER_KEYS.identify,
        value: null,
      }),
    ).rejects.toThrow('this printer is not available');
    await expect(
      driver?.execute({
        commandId: 'c2',
        externalId,
        capability: PRINTER_KEYS.pagesTotal,
        value: 1,
      }),
    ).rejects.toThrow('a printer only takes');
  });

  it('answers a read for a printer that is not set up with a plain failure', async () => {
    const result = await tool('printer').run({ view: 'overview' }, OWNER);
    expect(result.response['error']).toEqual(expect.any(String));
  });

  it('brings saved printers back after a restart without adding them again', async () => {
    await add();
    await shutdown();
    await launch(fixture);
    const result = await tool('printer').run({ view: 'overview' }, OWNER);
    expect(result.response['error']).toBeUndefined();
    expect(result.response['printer']).toMatchObject({ name: 'Hall' });
  });
});
