import { createSocket } from 'node:dgram';
import type { JsonValue } from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import {
  parseToken,
  pv11glCatalog,
  vacuumAction,
  vacuumProperty,
  type PropertyAddress,
} from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lanIo, type DeviceIo } from '../../src/adapters/xiaomi/device-io';
import { DeviceLink, type LinkHooks } from '../../src/adapters/xiaomi/device-link';
import { MessageIds, MiioClient } from '../../src/adapters/xiaomi/miio-client';
import type { CloudLookup } from '../../src/adapters/xiaomi/reachability';
import { updatePropertiesAddress, vacuumResync } from '../../src/vacuum/resync';
import { pause, until } from '../support/wait';
import { FakeMiioDevice } from '../xiaomi/fake-device';
import { dependencies, routedFetch } from '../xiaomi/harness';

const TOKEN = '0123456789abcdef0123456789abcdef';
const HOST = '127.0.0.7';
const DEVICE_ID = 0x0a0b0c1f;
const DID = String(DEVICE_ID);
const SETTLE_MS = 300;

interface Session {
  readonly link: DeviceLink;
  readonly shown: Map<string, JsonValue>;
  readonly refreshes: string[];
  readonly completed: string[];
  readonly client: MiioClient;
}

let device: FakeMiioDevice;
let port: number;
let logs: LogRecord[];
let sessions: Session[];
let messageIds: MessageIds;

const status = vacuumProperty('vacuum', 'status');
const mode = vacuumProperty('vacuum', 'mode');
const battery = vacuumProperty('battery', 'battery-level');

function key(address: PropertyAddress): string {
  return `${String(address.siid)}.${String(address.piid)}`;
}

function readableAddresses(): PropertyAddress[] {
  return pv11glCatalog()
    .properties.filter((entry) => entry.access.includes('read'))
    .map(({ siid, piid }) => ({ siid, piid }));
}

function getPropertiesCalls(): number {
  return device.requests.filter((request) => request.method === 'get_properties').length;
}

function open(extra: Partial<LinkHooks> = {}): Session {
  const timing = dependencies(routedFetch([]), port).timing;
  const client = new MiioClient({
    host: HOST,
    port,
    token: parseToken(TOKEN),
    socket: createSocket('udp4'),
    timing,
    now: (): number => Date.now(),
    log: new Logger('tool.xiaomi-test'),
    messageIds,
  });
  const shown = new Map<string, JsonValue>();
  const refreshes: string[] = [];
  const completed: string[] = [];
  const holder: { io: DeviceIo | null } = { io: null };
  const hooks: LinkHooks = {
    refresh: async (trigger): Promise<void> => {
      refreshes.push(trigger);
      const readings = (await holder.io?.read(readableAddresses())) ?? [];
      for (const reading of readings) {
        if (reading.ok) {
          shown.set(key(reading), reading.value);
        }
      }
      completed.push(trigger);
    },
    uplink: (uplink): void => {
      if (uplink.kind === 'properties') {
        for (const reading of uplink.readings) {
          if (reading.ok) {
            shown.set(key(reading), reading.value);
          }
        }
      }
    },
    changed: (): void => undefined,
    subscribed: vacuumResync.subscribed,
    ...extra,
  };
  const io = lanIo(DID, client);
  holder.io = io;
  const link = new DeviceLink(
    {
      did: DID,
      opened: { host: HOST, client, io, reason: 'test', retryHost: null },
      readable: true,
      online: true,
    },
    {
      log: new Logger('tool.xiaomi-test'),
      timing,
      now: (): number => Date.now(),
      jitter: (): number => 0.5,
      virtualDid: 1n,
      openCloud: (): DeviceIo => {
        throw new Error('the resync test never uses the cloud');
      },
      openLan: (): Promise<MiioClient> =>
        Promise.reject(new Error('the resync test never reconnects')),
      lookup: (): Promise<CloudLookup> => Promise.resolve({ host: null, online: true }),
      online: (): void => undefined,
    },
    hooks,
  );
  const session = { link, shown, refreshes, completed, client };
  sessions.push(session);
  link.start();
  return session;
}

beforeEach(async () => {
  logs = [];
  sessions = [];
  messageIds = new MessageIds(0);
  Logger.reset();
  Logger.configure({ level: 'trace', sink: (record) => logs.push(record) });
  device = new FakeMiioDevice({
    host: HOST,
    deviceId: DEVICE_ID,
    token: TOKEN,
    properties: { [key(status)]: 9, [key(mode)]: 1, [key(battery)]: 100 },
  });
  device.offersPush = true;
  port = await device.start();
});

afterEach(async () => {
  for (const session of sessions) {
    await session.link.stop();
  }
  await device.stop();
});

describe('vacuum resync on subscribe', () => {
  it('addresses action 10.7 update-properties-data from the catalog and sends no input', () => {
    expect(updatePropertiesAddress()).toStrictEqual({
      siid: vacuumAction('vacuumMap', 'update-properties-data').siid,
      aiid: vacuumAction('vacuumMap', 'update-properties-data').aiid,
    });
    expect(updatePropertiesAddress()).toStrictEqual({ siid: 10, aiid: 7 });
  });

  it('corrects a setting changed while the hub was down after the next subscribe', async () => {
    const first = open();
    await until(() => first.shown.get(key(mode)) === 1, 'the first session to read the mode');
    expect(first.shown.get(key(status))).toBe(9);
    await first.link.stop();

    device.properties.set(key(mode), 3);
    device.properties.set(key(status), 2);
    device.properties.set(key(battery), 97);
    const second = open();
    await until(() => second.shown.get(key(mode)) === 3, 'the second session to read the mode');
    expect(second.shown.get(key(status))).toBe(2);
    expect(second.shown.get(key(battery))).toBe(97);
    expect(second.refreshes).toStrictEqual(['subscription']);
  });

  it('corrects the status after a reconnect to a robot that ignores message ids it has seen', async () => {
    device.rejectsSeenIds = true;
    const first = open();
    await until(() => first.completed.length === 1, 'the first full read');
    expect(first.shown.get(key(status))).toBe(9);
    await first.link.stop();

    device.properties.set(key(status), 2);
    device.properties.set(key(battery), 97);
    const second = open();
    await until(() => second.completed.length === 1, 'the second full read');
    expect(second.shown.get(key(status))).toBe(2);
    expect(second.shown.get(key(battery))).toBe(97);
    expect(device.actions).toHaveLength(2);
  });

  it('asks the robot to push its properties once per subscribe', async () => {
    const first = open();
    await until(() => device.actions.length === 1, 'the first resync action');
    await first.link.stop();
    open();
    await until(() => device.actions.length === 2, 'the second resync action');
    expect(device.actions).toStrictEqual([
      { siid: 10, aiid: 7, inputs: [] },
      { siid: 10, aiid: 7, inputs: [] },
    ]);
    expect(device.subscriptions).toHaveLength(2);
  });

  it('neither polls nor repeats the resync while the subscription holds', async () => {
    const session = open();
    await until(() => session.completed.length === 1 && device.actions.length === 1, 'the resync');
    await until(() => session.link.pushing, 'the push session');
    const reads = getPropertiesCalls();
    await pause(SETTLE_MS);
    expect(getPropertiesCalls()).toBe(reads);
    expect(device.actions).toHaveLength(1);
    expect(session.refreshes).toStrictEqual(['subscription']);
  });

  it('still reads everything and logs the failure when the push request is refused', async () => {
    const session = open({
      subscribed: () => Promise.reject(new Error('the robot refused update-properties-data')),
    });
    await until(() => session.shown.get(key(mode)) === 1, 'the full read');
    await until(
      () => logs.some((record) => record.event === 'hooks.subscribed_failed'),
      'the logged failure',
    );
    expect(device.actions).toHaveLength(0);
  });
});
