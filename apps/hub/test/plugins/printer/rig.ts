import type { PluginEvent } from '@smarteverything/domain';
import type { AdapterSink, DiscoveredDevice, StateUpdate } from '@smarteverything/domain';
import { PrinterClient } from '../../../src/plugins/builtin/printer/client';
import { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import type { SessionHost } from '../../../src/plugins/builtin/printer/session-host';
import {
  PRINTERS,
  PRINTER_RECORD,
  type PrinterRecord,
} from '../../../src/plugins/builtin/printer/records';
import { parseAddress } from '../../../src/plugins/builtin/printer/address';
import type { PluginRecords, PluginSecrets } from '../../../src/plugins/builtin/contract';
import { testLogger } from '../../support/logs';
import { memoryRecords } from '../memory-records';
import type { FakeIppPrinter } from './fake-ipp-printer';

export interface Rig {
  readonly host: SessionHost;
  readonly events: PluginEvent[];
  readonly devices: DiscoveredDevice[];
  readonly states: StateUpdate[];
  readonly sink: AdapterSink;
  readonly collections: Map<string, PluginRecords>;
  readonly time: { now: Date };
  readonly secretValues: Map<string, string>;
  readonly changed: { count: number };
  readonly samples: { key: string; value: number }[];
}

function secretsOf(values: Map<string, string>): PluginSecrets {
  return {
    get: (name) => values.get(name) ?? null,
    set: (name, value): Promise<void> => {
      values.set(name, value);
      return Promise.resolve();
    },
    remove: (name): Promise<void> => {
      values.delete(name);
      return Promise.resolve();
    },
  };
}

function sinkOf(devices: DiscoveredDevice[], states: StateUpdate[]): AdapterSink {
  return {
    devices: (found): void => {
      devices.push(...found);
    },
    state: (update): void => {
      states.push({ ...update });
    },
    event: () => undefined,
    online: () => undefined,
    failure: () => undefined,
  };
}

export function newRig(zone = 'UTC'): Rig {
  const events: PluginEvent[] = [];
  const devices: DiscoveredDevice[] = [];
  const states: StateUpdate[] = [];
  const collections = new Map<string, PluginRecords>();
  const time = { now: new Date('2026-10-18T10:00:00.000Z') };
  const secretValues = new Map<string, string>();
  const changed = { count: 0 };
  const samples: { key: string; value: number }[] = [];
  const host: SessionHost = {
    log: testLogger('printer'),
    clock: { now: () => new Date(time.now), timeZone: () => zone },
    records: (collection) => {
      const known = collections.get(collection) ?? memoryRecords();
      collections.set(collection, known);
      return known;
    },
    secrets: secretsOf(secretValues),
    viewers: { watchDevice: () => () => undefined },
    metrics: {
      push: (_id, key, value) => {
        samples.push({ key, value });
      },
    },
    send: (event) => {
      events.push(event);
    },
    signal: new AbortController().signal,
    openClient: (setup) => new PrinterClient(setup),
    changed: () => {
      changed.count += 1;
    },
  };
  const sink = sinkOf(devices, states);
  return { host, events, devices, states, sink, collections, time, secretValues, changed, samples };
}

export function recordFor(
  printer: FakeIppPrinter,
  patch: Partial<PrinterRecord> = {},
): PrinterRecord {
  return PRINTER_RECORD.parse({
    uuid: printer.state.uuid,
    uri: parseAddress(printer.url).uri,
    name: printer.state.name,
    firstDay: '2026-10-01',
    ...patch,
  });
}

export async function openSession(
  rig: Rig,
  printer: FakeIppPrinter,
  patch: Partial<PrinterRecord> = {},
): Promise<PrinterSession> {
  const record = recordFor(printer, patch);
  const client = new PrinterClient({
    address: parseAddress(record.uri),
    pin: record.pin,
    credentials: null,
  });
  const described = await client.describe();
  const session = new PrinterSession(rig.host, record, described, true);
  session.mirror.attach(rig.sink);
  return session;
}

export async function reopenSession(rig: Rig, printer: FakeIppPrinter): Promise<PrinterSession> {
  const record = PRINTER_RECORD.parse(rig.host.records(PRINTERS).get(printer.state.uuid));
  const client = new PrinterClient({
    address: parseAddress(record.uri),
    pin: record.pin,
    credentials: null,
  });
  const described = await client.describe();
  const session = new PrinterSession(rig.host, record, described, true);
  session.mirror.attach(rig.sink);
  return session;
}
