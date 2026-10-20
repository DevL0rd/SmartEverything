import { join } from 'node:path';
import type { ProviderAdapter } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderModule } from '../src/adapters/contract';
import { televisionsAccount, televisionsOf, withTelevision } from '../src/adapters/samsung-tv/link';
import { startHub, type RunningHub } from '../src/hub';
import { SecretStore } from '../src/secrets/store';
import { recordingPathIn } from '../src/services';
import { storeDatabase } from '../src/store/hub-database';
import type { Store } from '../src/store/store';
import { FakeClock } from './support/fake-clock';
import { captureLogs, testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

const IDLE: ProviderAdapter = {
  provider: 'samsung_tv',
  discover: () => Promise.resolve([]),
  subscribe: () => Promise.resolve(() => Promise.resolve()),
  execute: () => Promise.resolve(null),
  refresh: () => Promise.resolve([]),
};

const MACS: Readonly<Record<string, string>> = {
  '192.0.2.10': 'aa:bb:cc:dd:ee:ff',
  '192.0.2.11': '10:20:30:40:50:60',
};

const SAMSUNG: ProviderModule<'samsung_tv'> = {
  provider: 'samsung_tv',
  link: (credentials, context) =>
    Promise.resolve(
      televisionsAccount(
        withTelevision(televisionsOf(context.stored), {
          host: credentials.host,
          macAddress: MACS[credentials.host] ?? 'unknown',
          name: credentials.name ?? 'TV',
          model: 'QN90',
          token: 'token',
          frame: false,
          ...(credentials.attachTo === undefined ? {} : { attachedTo: credentials.attachTo }),
        }),
      ),
    ),
  start: () => Promise.resolve(IDLE),
};

function addTelevision(
  store: Store,
  externalId: string,
  provider: 'smartthings' | 'samsung_tv' = 'smartthings',
): string {
  const [row] = store.devices.upsert([
    {
      provider,
      externalId,
      parentId: null,
      kind: 'television',
      name: externalId,
      model: 'QN90',
      manufacturer: 'Samsung',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The television was not stored.');
  return row.id;
}

async function startHubWithoutAccounts(): Promise<RunningHub> {
  const secrets = await SecretStore.open(join(opened.directory, 'secrets'), Buffer.alloc(32, 5));
  return startHub({
    store: opened.store,
    database: storeDatabase(opened.store, recordingPathIn(opened.directory)),
    accountChanged: () => Promise.resolve(false),
    registry: { samsung_tv: SAMSUNG },
    secrets,
    go2rtc: {
      putStream: () => Promise.resolve(),
      deleteStream: () => Promise.resolve(),
      preload: () => Promise.resolve(),
      unpreload: () => Promise.resolve(),
      answer: () => Promise.resolve(''),
      frame: () => Promise.resolve(new Uint8Array()),
      clip: () => Promise.resolve(new Uint8Array()),
      consumers: () => Promise.resolve([]),
      closeConsumer: () => Promise.resolve(),
      play: () => Promise.resolve(),
      backchannel: () => Promise.resolve(true),
      socketOf: () => ({ url: 'ws://go2rtc/api/ws', authorization: 'Basic x' }),
    },
    cameraRefusal: () => null,
    devicesChanged: () => undefined,
    dataDirectory: opened.directory,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    logFor: (area) => testLogger(area),
  });
}

function linkTo(
  hub: RunningHub,
  attachTo: string | undefined,
  host = '192.0.2.10',
): Promise<unknown> {
  return hub.providers.link({
    provider: 'samsung_tv',
    host,
    ...(attachTo === undefined ? {} : { attachTo }),
  });
}

function directOf(store: Store, deviceId: string): unknown {
  const row = store.televisionSettings.find(deviceId);
  return row === undefined ? undefined : { host: row.direct_host, mac: row.direct_mac };
}

describe('the direct link of a television', () => {
  it('stores the address and the wake address on the television it is linked from', async () => {
    const tv = addTelevision(opened.store, 'tv-1');
    const other = addTelevision(opened.store, 'tv-2');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, tv);
    expect(directOf(opened.store, tv)).toEqual({ host: '192.0.2.10', mac: 'aa:bb:cc:dd:ee:ff' });
    expect(opened.store.televisionSettings.find(other)).toBeUndefined();
    await hub.stop();
  });

  it('keeps one link for each screen when several are linked', async () => {
    const first = addTelevision(opened.store, 'tv-1');
    const second = addTelevision(opened.store, 'tv-2');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, first);
    await linkTo(hub, second, '192.0.2.11');
    expect(directOf(opened.store, first)).toEqual({ host: '192.0.2.10', mac: 'aa:bb:cc:dd:ee:ff' });
    expect(directOf(opened.store, second)).toEqual({
      host: '192.0.2.11',
      mac: '10:20:30:40:50:60',
    });
    await hub.stop();
  });

  it('moves to another television when the same screen is linked again for it', async () => {
    const first = addTelevision(opened.store, 'tv-1');
    const second = addTelevision(opened.store, 'tv-2');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, first);
    await linkTo(hub, second);
    expect(directOf(opened.store, first)).toEqual({ host: null, mac: null });
    expect(directOf(opened.store, second)).toEqual({
      host: '192.0.2.10',
      mac: 'aa:bb:cc:dd:ee:ff',
    });
    await hub.stop();
  });

  it('is not stored on any television when the link is attached to none', async () => {
    addTelevision(opened.store, 'tv-1');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, undefined);
    expect(opened.store.televisionSettings.list()).toEqual([]);
    await hub.stop();
  });

  it('removes the device a screen had of its own once it is linked to its SmartThings device', async () => {
    const tv = addTelevision(opened.store, 'tv-1');
    const own = addTelevision(opened.store, 'aa:bb:cc:dd:ee:ff', 'samsung_tv');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, tv);
    expect(opened.store.devices.find(own)).toBeUndefined();
    expect(opened.store.devices.find(tv)?.provider).toBe('smartthings');
    await hub.stop();
  });

  it('is cleared when the account is unlinked', async () => {
    const tv = addTelevision(opened.store, 'tv-1');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, tv);
    hub.submit([
      {
        deviceId: null,
        capability: 'hub:unlink_provider',
        value: { provider: 'samsung_tv' },
        source: 'app',
        requestedBy: null,
      },
    ]);
    await hub.settled();
    expect(directOf(opened.store, tv)).toEqual({ host: null, mac: null });
    await hub.stop();
  });
});
