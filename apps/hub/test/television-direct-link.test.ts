import { join } from 'node:path';
import type { ProviderAdapter } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderModule } from '../src/adapters/contract';
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

const SAMSUNG: ProviderModule<'samsung_tv'> = {
  provider: 'samsung_tv',
  link: (credentials) =>
    Promise.resolve({
      label: credentials.name,
      secrets: {
        host: credentials.host,
        macAddress: credentials.macAddress,
        name: credentials.name,
        model: 'QN90',
        token: 'token',
        frame: false,
        ...(credentials.attachTo === undefined ? {} : { attachedTo: credentials.attachTo }),
      },
    }),
  start: () => Promise.resolve(IDLE),
};

function addTelevision(store: Store, externalId: string): string {
  const [row] = store.devices.upsert([
    {
      provider: 'smartthings',
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
      answer: () => Promise.resolve(''),
      frame: () => Promise.resolve(new Uint8Array()),
      clip: () => Promise.resolve(new Uint8Array()),
      consumers: () => Promise.resolve([]),
      closeConsumer: () => Promise.resolve(),
      play: () => Promise.resolve(),
      socketOf: () => ({ url: 'ws://go2rtc/api/ws', authorization: 'Basic x' }),
    },
    devicesChanged: () => undefined,
    dataDirectory: opened.directory,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    logFor: (area) => testLogger(area),
  });
}

function linkTo(hub: RunningHub, attachTo: string | undefined): Promise<unknown> {
  return hub.providers.link({
    provider: 'samsung_tv',
    host: '192.0.2.10',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    name: 'TV',
    ...(attachTo === undefined ? {} : { attachTo }),
  });
}

describe('the direct link of a television', () => {
  it('is marked on the television a new link is attached to', async () => {
    const tv = addTelevision(opened.store, 'tv-1');
    const other = addTelevision(opened.store, 'tv-2');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, tv);
    expect(opened.store.televisionSettings.find(tv)?.direct_link).toBe(true);
    expect(opened.store.televisionSettings.find(other)).toBeUndefined();
    await hub.stop();
  });

  it('moves to another television when the link is made again for it', async () => {
    const first = addTelevision(opened.store, 'tv-1');
    const second = addTelevision(opened.store, 'tv-2');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, first);
    await linkTo(hub, second);
    expect(opened.store.televisionSettings.find(first)?.direct_link).toBe(false);
    expect(opened.store.televisionSettings.find(second)?.direct_link).toBe(true);
    await hub.stop();
  });

  it('is not marked on any television when the link is attached to none', async () => {
    addTelevision(opened.store, 'tv-1');
    const hub = await startHubWithoutAccounts();
    await linkTo(hub, undefined);
    expect(opened.store.televisionSettings.list()).toEqual([]);
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
    expect(opened.store.televisionSettings.find(tv)?.direct_link).toBe(false);
    await hub.stop();
  });
});
