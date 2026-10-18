import { TEST_AUTHOR } from './support/automation-author';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Go2rtcClient } from '../src/cameras/go2rtc-client';
import { startHub, type RunningHub } from '../src/hub';
import { SecretStore } from '../src/secrets/store';
import { recordingPathIn } from '../src/services';
import { storeDatabase } from '../src/store/hub-database';
import type { Store } from '../src/store/store';
import { FakeClock } from './support/fake-clock';
import { CAMERA, LAMP, fakeModule, type FakeModule } from './support/fake-provider';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { legacyAutomation } from './support/legacy-automation';

let logs: CapturedLogs;
let opened: TestStore;

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

interface Started {
  readonly store: Store;
  readonly fake: FakeModule;
  readonly hub: RunningHub;
  readonly go2rtcCalls: string[];
  readonly accountChanges: string[];
}

function fakeGo2rtc(calls: string[]): Go2rtcClient {
  return {
    putStream: (name): Promise<void> => {
      calls.push(`put ${name}`);
      return Promise.resolve();
    },
    deleteStream: () => Promise.resolve(),
    answer: (_stream, offer) => Promise.resolve(`answer:${offer}`),
    frame: () => Promise.resolve(new Uint8Array([1])),
    clip: () => Promise.resolve(new Uint8Array([2, 3])),
    consumers: () => Promise.resolve([]),
    closeConsumer: () => Promise.resolve(),
    play: () => Promise.resolve(),
    socketOf: () => ({ url: 'ws://go2rtc/api/ws', authorization: 'Basic x' }),
  };
}

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function start(before: (store: Store) => void = () => undefined): Promise<Started> {
  const store = opened.store;
  const fake = fakeModule();
  fake.adapter.devices = [LAMP, CAMERA];
  const secrets = await SecretStore.open(join(opened.directory, 'secrets'), Buffer.alloc(32, 5));
  await secrets.saveAccount('xiaomi', { label: 'me', secrets: {} });
  before(store);
  const go2rtcCalls: string[] = [];
  const accountChanges: string[] = [];
  const hub = await startHub({
    store,
    database: storeDatabase(store, recordingPathIn(opened.directory)),
    accountChanged: (provider) => {
      accountChanges.push(provider);
      return Promise.resolve(false);
    },
    registry: { xiaomi: fake.module },
    secrets,
    go2rtc: fakeGo2rtc(go2rtcCalls),
    devicesChanged: () => undefined,
    dataDirectory: opened.directory,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    logFor: (area) => testLogger(area),
  });
  return { store, fake, hub, go2rtcCalls, accountChanges };
}

function deviceId(store: Store, externalId: string): string {
  const device = store.devices.list().find((candidate) => candidate.external_id === externalId);
  if (device === undefined) {
    throw new Error(`no device ${externalId}`);
  }
  return device.id;
}

describe('hub core on the SQLite store', () => {
  it('saves what linked providers discover, registers camera streams and catches up on waiting commands', async () => {
    const { store, fake, hub, go2rtcCalls } = await start();
    const lamp = deviceId(store, 'lamp-1');
    const camera = deviceId(store, 'camera-1');
    expect(store.devices.byId(lamp)).toMatchObject({
      name: 'Desk lamp',
      kind: 'light',
      online: true,
    });
    expect(store.devices.byId(camera).parent_id).toBeNull();
    expect(store.cameras.byDevice(camera)).toMatchObject({
      physical_ptz: true,
      record_events: true,
    });
    expect(go2rtcCalls).toStrictEqual([`put ${camera}`]);
    expect(store.providers.find('xiaomi')).toMatchObject({ status: 'linked', device_count: 2 });
    expect(
      store.rooms
        .list()
        .map((room) => room.name)
        .sort(),
    ).toStrictEqual(['Hall', 'Study']);
    expect(fake.started).toHaveLength(1);
    await hub.stop();
    const [waiting] = store.commands.insert([
      { deviceId: lamp, capability: 'power', value: true, source: 'app', requestedBy: null },
    ]);
    const restarted = await start();
    await restarted.hub.settled();
    expect(store.commands.byId(waiting?.id ?? '')).toMatchObject({ status: 'succeeded' });
    expect(
      logs.records
        .filter((record) => record.event === 'commands.caught_up')
        .map((record) => record.payload),
    ).toStrictEqual([{ count: 0 }, { count: 1 }]);
    await restarted.hub.stop();
  });

  it('runs submitted commands in process, records the outcome and streams every change', async () => {
    const { store, fake, hub } = await start();
    const changes: RowChange[] = [];
    store.feed.subscribe((change) => changes.push(change));
    fake.adapter.result = { applied: true };
    const lamp = deviceId(store, 'lamp-1');
    const [row] = hub.submit([
      { deviceId: lamp, capability: 'brightness', value: 40, source: 'app', requestedBy: null },
    ]);
    await hub.settled();
    expect(fake.adapter.executed.map((command) => command.value)).toStrictEqual([40]);
    expect(store.commands.byId(row?.id ?? '')).toMatchObject({
      status: 'succeeded',
      result: { applied: true },
    });
    expect(
      changes.filter((change) => change.table === 'commands').map((change) => change.operation),
    ).toStrictEqual(['INSERT', 'UPDATE', 'UPDATE']);
    await hub.stop();
  });

  it('feeds adapter state into the store and its history, and runs automations that react to it', async () => {
    const { store, fake, hub } = await start();
    const lamp = deviceId(store, 'lamp-1');
    store.automations.create({
      name: 'Bright when on',
      enabled: true,
      definition: legacyAutomation({
        triggers: [
          {
            type: 'state',
            deviceId: lamp,
            capability: 'power',
            comparison: { operator: 'eq', value: true },
          },
        ],
        conditions: { mode: 'all', items: [] },
        origin: null,
        actions: [{ type: 'command', deviceId: lamp, capability: 'brightness', value: 80 }],
      }),
      origin: null,
      author: TEST_AUTHOR,
    });
    await until(() => logs.events().filter((event) => event === 'automations.loaded').length >= 2);
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: '2026-10-08T10:00:01Z',
    });
    await until(() => fake.adapter.executed.length === 1);
    await hub.settled();
    expect(store.state.list()).toStrictEqual([
      {
        device_id: lamp,
        capability: 'power',
        value: true,
        observed_at: '2026-10-08T10:00:01.000Z',
      },
    ]);
    expect(
      store.state.history({
        capabilities: ['power'],
        from: '2026-10-08T00:00:00Z',
        order: 'asc',
        limit: 10,
      }),
    ).toHaveLength(1);
    expect(fake.adapter.executed[0]).toMatchObject({ capability: 'brightness', value: 80 });
    const automation = store.automations.list()[0];
    await until(() => store.automations.list()[0]?.run_count === 1);
    expect(automation?.name).toBe('Bright when on');
    expect(store.commands.recent(10).map((command) => command.source)).toContain('automation');
    await hub.stop();
  });

  it('answers WebRTC offers and records camera events to files unless recording is off', async () => {
    const { store, fake, hub } = await start();
    const camera = deviceId(store, 'camera-1');
    await expect(hub.answerOffer(camera, 'offer', 'client-1', 'full')).resolves.toBe(
      'answer:offer',
    );
    await expect(hub.streamReady('missing')).rejects.toThrow(
      'There is no camera stream named missing on this hub.',
    );
    fake.adapter.sink?.event({
      externalId: 'camera-1',
      kind: 'doorbell',
      occurredAt: '2026-10-08T10:00:02Z',
      details: {},
    });
    await until(() => store.cameras.recordings({ limit: 10 }).length === 2);
    const recordings = store.cameras.recordings({ limit: 10 });
    const snapshot = recordings.find((recording) => recording.kind === 'snapshot');
    expect(snapshot?.storage_path).toBe(`${camera}/20261008T100002000Z.jpg`);
    expect(
      await readFile(recordingPathIn(opened.directory)(snapshot?.storage_path ?? '')),
    ).toStrictEqual(Buffer.from([1]));
    store.cameras.change(camera, { record_events: false });
    fake.adapter.sink?.event({
      externalId: 'camera-1',
      kind: 'motion',
      occurredAt: '2026-10-08T10:00:03Z',
      details: {},
    });
    await until(() => store.events.list({ limit: 10 }).length === 2);
    await hub.settled();
    expect(store.cameras.recordings({ limit: 10 })).toHaveLength(2);
    await hub.stop();
  });

  it('reloads automations on real changes and on a new home location, not on scenes or run bookkeeping', async () => {
    const { store, hub } = await start();
    const loads = (): number =>
      logs.events().filter((event) => event === 'automations.loaded').length;
    const before = loads();
    const scene = store.scenes.create({ name: 'Evening', icon: 'moon', actions: [], position: 0 });
    store.settings.updateHome({ home_name: 'Flat' });
    store.settings.updateHome({ time_zone: 'Europe/Berlin' });
    await until(() => loads() === before + 1);
    const automation = store.automations.create({
      name: 'Never',
      enabled: false,
      definition: legacyAutomation({
        triggers: [{ type: 'interval', everyMinutes: 5 }],
        conditions: { mode: 'all', items: [] },
        origin: null,
        actions: [{ type: 'scene', sceneId: scene.id }],
      }),
      origin: null,
      author: TEST_AUTHOR,
    });
    await until(() => loads() === before + 2);
    store.automations.recordRun(automation.id, { lastError: null, runCount: 2 });
    store.rooms.create('Attic', 0);
    await hub.settled();
    expect(loads()).toBe(before + 2);
    await hub.stop();
  });

  it('stops an active run when its automation is disabled and checks runs only on relevant changes', async () => {
    const { store, fake, hub } = await start();
    const lamp = deviceId(store, 'lamp-1');
    const automation = store.automations.create({
      name: 'Slow',
      enabled: true,
      definition: legacyAutomation({
        triggers: [
          {
            type: 'state',
            deviceId: lamp,
            capability: 'power',
            comparison: { operator: 'eq', value: true },
          },
        ],
        conditions: { mode: 'all', items: [] },
        origin: null,
        actions: [{ type: 'delay', seconds: 600 }],
      }),
      origin: null,
      author: TEST_AUTHOR,
    });
    await until(() => logs.events().filter((event) => event === 'automations.loaded').length >= 2);
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: '2026-10-08T10:00:01Z',
    });
    await until(() => store.automationRuns.list(automation.id).length === 1);
    const lookups = vi.spyOn(store.automations, 'byId');
    store.rooms.create('Attic', 0);
    store.automations.recordRun(automation.id, { lastError: null, runCount: 1 });
    lookups.mockClear();
    store.rooms.create('Cellar', 1);
    expect(lookups).not.toHaveBeenCalled();
    store.automations.update(automation.id, { enabled: false });
    await until(() => store.automationRuns.list(automation.id)[0]?.status === 'cancelled');
    expect(store.automationRuns.list(automation.id)[0]?.error).toBe(
      'ApiError: The automation was disabled while its run was active.',
    );
    await hub.stop();
  });

  it('announces devices going offline when their provider is unlinked', async () => {
    const { store, hub, accountChanges } = await start();
    const [row] = hub.submit([
      {
        deviceId: null,
        capability: 'hub:unlink_provider',
        value: { provider: 'xiaomi' },
        source: 'app',
        requestedBy: null,
      },
    ]);
    await hub.settled();
    expect(store.commands.byId(row?.id ?? '').status).toBe('succeeded');
    expect(store.devices.list().every((device) => !device.online)).toBe(true);
    expect(store.events.list({ limit: 10 }).map((event) => event.kind)).toContain('device_offline');
    expect(store.providers.find('xiaomi')?.status).toBe('unlinked');
    expect(accountChanges).toStrictEqual(['xiaomi']);
    await hub.stop();
  });
});
