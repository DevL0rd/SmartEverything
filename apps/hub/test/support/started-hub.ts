import { join } from 'node:path';
import { startHub, type RunningHub } from '../../src/hub';
import { SecretStore } from '../../src/secrets/store';
import { recordingPathIn } from '../../src/services';
import { storeDatabase } from '../../src/store/hub-database';
import type { Store } from '../../src/store/store';
import type { Go2rtcClient } from '../../src/cameras/go2rtc-client';
import { FakeClock } from './fake-clock';
import { LAMP, fakeModule, type FakeModule } from './fake-provider';
import { testLogger } from './logs';
import type { TestStore } from './store';

export interface StartedHub {
  readonly store: Store;
  readonly fake: FakeModule;
  readonly hub: RunningHub;
}

const NO_GO2RTC: Go2rtcClient = {
  putStream: () => Promise.resolve(),
  deleteStream: () => Promise.resolve(),
  preload: () => Promise.resolve(),
  unpreload: () => Promise.resolve(),
  answer: (_stream, offer) => Promise.resolve(`answer:${offer}`),
  frame: () => Promise.resolve(new Uint8Array([1])),
  clip: () => Promise.resolve(new Uint8Array([2, 3])),
  consumers: () => Promise.resolve([]),
  closeConsumer: () => Promise.resolve(),
  play: () => Promise.resolve(),
  backchannel: () => Promise.resolve(true),
  socketOf: () => ({ url: 'ws://go2rtc/api/ws', authorization: 'Basic x' }),
};

export async function startedHub(opened: TestStore): Promise<StartedHub> {
  const { store } = opened;
  const fake = fakeModule();
  fake.adapter.devices = [LAMP, { ...LAMP, externalId: 'lamp-2', name: 'Hall lamp' }];
  const secrets = await SecretStore.open(join(opened.directory, 'secrets'), Buffer.alloc(32, 5));
  await secrets.saveAccount('xiaomi', { label: 'me', secrets: {} });
  const hub = await startHub({
    store,
    database: storeDatabase(store, recordingPathIn(opened.directory)),
    accountChanged: () => Promise.resolve(false),
    registry: { xiaomi: fake.module },
    secrets,
    go2rtc: NO_GO2RTC,
    cameraRefusal: () => null,
    devicesChanged: () => undefined,
    dataDirectory: opened.directory,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    logFor: (area) => testLogger(area),
  });
  return { store, fake, hub };
}

export function deviceIdOf(store: Store, externalId: string): string {
  const device = store.devices.list().find((candidate) => candidate.external_id === externalId);
  if (device === undefined) {
    throw new Error(`no device ${externalId}`);
  }
  return device.id;
}
