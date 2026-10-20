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
import { EMPTY_LAYOUT, node, saveAutomation, trigger } from './support/automation-fixture';

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
    cameraRefusal: () => null,
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
    const { store, fake, hub, go2rtcCalls } = await start((opened) => {
      opened.rooms.create('Study', 0);
      opened.rooms.create('Hall', 1);
    });
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

  it('tells the started signal how long the hub was off after a clean stop and forgets the mark', async () => {
    const first = await start();
    const started = { source: 'hub', kind: 'started' };
    expect(first.hub.signals.latest(started)[0]?.data).toStrictEqual({});
    await first.hub.stop();
    expect(first.store.hubMarks.read('stopped')).toBe('2026-10-08T10:00:00.000Z');
    const second = await start((store) => {
      store.hubMarks.write('stopped', '2026-10-08T09:59:30.000Z');
    });
    expect(second.hub.signals.latest(started)[0]?.data).toStrictEqual({ downFor: 30_000 });
    expect(second.store.hubMarks.read('stopped')).toBeNull();
    await second.hub.stop();
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
    saveAutomation(store, {
      name: 'Bright when on',
      triggers: [
        trigger('trigger.signal', {
          source: 'device',
          kind: 'state',
          subject: lamp,
          field: 'power',
          test: { is: 'eq', to: true },
        }),
      ],
      body: [node('device.set', { target: { device: lamp }, control: 'brightness', to: 80 })],
    });
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: false,
      observedAt: '2026-10-08T10:00:00Z',
    });
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

  it('starts an automation from a webhook call and from a timer that ends, on the running hub', async () => {
    const { store, fake, hub } = await start();
    const lamp = deviceId(store, 'lamp-1');
    const path = 'k3Jq9Zr2Lm8Xv5Bn7TcWd1';
    saveAutomation(store, {
      name: 'Hook',
      triggers: [trigger('trigger.webhook', { path })],
      body: [node('device.set', { target: { device: lamp }, control: 'brightness', to: 71 })],
    });
    const starter = saveAutomation(store, { name: 'Starts the timer' });
    saveAutomation(store, {
      name: 'Timer done',
      triggers: [trigger('trigger.timer', { timer: 'laundry' })],
      body: [node('device.set', { target: { device: lamp }, control: 'brightness', to: 72 })],
    });
    hub.automationEngine.sync();
    const answer = await hub.automationWebhooks.call({
      path,
      method: 'POST',
      body: { who: 'ann' },
      headers: {},
      query: {},
    });
    expect(answer).toMatchObject({ status: 204 });
    expect(fake.adapter.executed.map((command) => command.value)).toStrictEqual([71]);
    expect(
      await hub.automationWebhooks.call({
        path: 'nobodyListensHere1234',
        method: 'POST',
        body: undefined,
        headers: {},
        query: {},
      }),
    ).toBeNull();
    store.automationNodeState.save({
      automationId: starter.id,
      nodeId: 'timer:laundry',
      partition: 'state',
      state: { deadline: 1 },
      wakeAt: '2026-10-08T09:00:00.000Z',
    });
    await hub.stop();
    const restarted = await start();
    await until(() => restarted.fake.adapter.executed.length === 1);
    expect(restarted.fake.adapter.executed.map((command) => command.value)).toStrictEqual([72]);
    expect(store.automationNodeState.get(starter.id, 'timer:laundry', 'state')?.wake_at).toBeNull();
    await restarted.hub.stop();
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
    await until(() => store.events.list({ kinds: ['doorbell', 'motion'], limit: 10 }).length === 2);
    await hub.settled();
    expect(store.cameras.recordings({ limit: 10 })).toHaveLength(2);
    await hub.stop();
  });

  it('reloads automations on real changes and on a new home location, not on scenes or run bookkeeping', async () => {
    const { store, hub } = await start();
    const reload = vi.spyOn(hub.automationEngine, 'reload');
    const sync = vi.spyOn(hub.automationEngine, 'sync');
    store.scenes.create({ name: 'Evening', icon: 'moon', actions: [], position: 0 });
    store.settings.updateHome({ home_name: 'Flat' });
    expect(sync).not.toHaveBeenCalled();
    store.settings.updateHome({ time_zone: 'Europe/Berlin' });
    expect(sync).toHaveBeenCalledTimes(1);
    const automation = saveAutomation(store, {
      name: 'Never',
      enabled: false,
      triggers: [trigger('trigger.interval', { every: 300_000 })],
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith(automation.id);
    store.automations.recordRun(automation.id, {
      lastError: null,
      lastRunAt: '2026-10-08T10:00:00.000Z',
    });
    store.automations.saveLayout(automation.id, EMPTY_LAYOUT, automation.revision);
    store.rooms.create('Attic', 0);
    await hub.settled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
    store.automations.setEnabled(automation.id, true);
    expect(reload).toHaveBeenCalledTimes(2);
    await hub.stop();
  });

  it('stops an active run when its automation is disabled and looks automations up only on relevant changes', async () => {
    const { store, fake, hub } = await start();
    const lamp = deviceId(store, 'lamp-1');
    const automation = saveAutomation(store, {
      name: 'Slow',
      triggers: [
        trigger('trigger.signal', {
          source: 'device',
          kind: 'state',
          subject: lamp,
          field: 'power',
          test: { is: 'eq', to: true },
        }),
      ],
      body: [node('flow.wait', { duration: 600_000 })],
    });
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: false,
      observedAt: '2026-10-08T10:00:00Z',
    });
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: true,
      observedAt: '2026-10-08T10:00:01Z',
    });
    const runs = (): ReturnType<Store['automationRunRecords']['summaries']> =>
      store.automationRunRecords.summaries(automation.id, 10);
    await until(() => runs().length === 1);
    const lookups = vi.spyOn(store.automations, 'find');
    store.rooms.create('Attic', 0);
    store.automations.recordRun(automation.id, {
      lastError: null,
      lastRunAt: '2026-10-08T10:00:00.000Z',
    });
    lookups.mockClear();
    store.rooms.create('Cellar', 1);
    expect(lookups).not.toHaveBeenCalled();
    store.automations.setEnabled(automation.id, false);
    await until(() => runs()[0]?.status === 'cancelled');
    await hub.stop();
  });

  it('runs an automation by hand: feed note, scene, toggle, run bookkeeping and outputs', async () => {
    const { store, fake, hub } = await start();
    const lamp = deviceId(store, 'lamp-1');
    const scene = store.scenes.create({
      name: 'Evening',
      icon: 'moon',
      actions: [{ type: 'command', deviceId: lamp, capability: 'brightness', value: 30 }],
      position: 0,
    });
    const automation = saveAutomation(store, {
      name: 'By hand',
      body: [
        node('notify.feed', { message: 'Hello' }),
        node('scene.run', { scene: scene.id }),
        node('device.toggle', { target: { device: lamp }, control: 'power' }),
      ],
    });
    fake.adapter.sink?.state({
      externalId: 'lamp-1',
      capability: 'power',
      value: false,
      observedAt: '2026-10-08T10:00:00Z',
    });
    await hub.settled();
    const submission = hub.automationEngine.start(automation.id, {}, null);
    if (submission.kind === 'refused') throw submission.error;
    await hub.automationEngine.finished(submission.runId);
    await hub.settled();
    expect(store.automationRunRecords.summaryById(submission.runId)).toMatchObject({
      status: 'succeeded',
      error: null,
    });
    expect(fake.adapter.executed.map((command) => command.capability).sort()).toStrictEqual([
      'brightness',
      'power',
    ]);
    const note = store.events
      .list({ limit: 20 })
      .find((event) => event.kind === 'automation_run' && event.details['message'] === 'Hello');
    expect(note?.details).toMatchObject({ automationId: automation.id, name: 'By hand' });
    const noted = store.events
      .list({ limit: 20 })
      .find((event) => event.kind === 'automation_run' && event.details['outcome'] !== undefined);
    expect(noted?.details).toMatchObject({ automationId: automation.id, outcome: 'succeeded' });
    expect(store.automations.byId(automation.id)).toMatchObject({
      run_count: 1,
      last_error: null,
    });
    expect(store.automations.byId(automation.id).last_run_at).not.toBeNull();
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
