import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  NODE_POLICY,
  NODE_REGISTRY,
  runModeOf,
  type NodeKind,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
  type RoomRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modeOf } from '../../../src/automations/effects/action-mode';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { DeviceToggler } from '../../../src/automations/effects/device-toggle';
import { captureScene } from '../../../src/automations/effects/scene-capture';
import { effectHandlers } from '../../../src/automations/engine-v3-effects';
import { deviceExtraHandlers } from '../../../src/automations/engine-v3-effects-devices';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { FakeAdapter, LAMP } from '../../support/fake-provider';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const LAMPS = 6;
const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

class CountingAdapter extends FakeAdapter {
  readonly together: DeviceCommand[][] = [];
  gate: Promise<void> | null = null;

  constructor() {
    super();
    const immediate = this.execute;
    this.execute = async (command): Promise<JsonValue> => {
      if (this.gate === null) return immediate(command);
      this.executed.push(command);
      await this.gate;
      return null;
    };
  }

  executeTogether = (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
    this.together.push([...commands]);
    return Promise.resolve(null);
  };

  close(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }
}

const FAN: DiscoveredDevice = {
  ...LAMP,
  externalId: 'fan-1',
  kind: 'fan',
  name: 'Fan',
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  ],
};

function unused(): never {
  throw new Error('not used by this test');
}

function request(kind: string, mode?: EffectRequest['mode']): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params: {},
    retry: 'idempotent',
    budget: 'command',
    ...(mode === undefined ? {} : { mode }),
  };
}

type Perform = (
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
) => Promise<NodeResult>;

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly lampIds: readonly string[];
  readonly adapter: CountingAdapter;
  readonly clock: FakeClock;
  readonly perform: Perform;
  readonly counts: { admissions: number; inserts: number };
}

async function home(): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const room = db.store.rooms.create('Study', 0);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  const lamps = Array.from({ length: LAMPS }, (_, index) => ({
    ...LAMP,
    externalId: `lamp-${String(index)}`,
    name: `Lamp ${String(index)}`,
  }));
  await inventory.apply('xiaomi', [...lamps, FAN]);
  const lampIds = lamps.map((lamp) => inventory.deviceOf('xiaomi', lamp.externalId)?.id ?? '');
  const adapter = new CountingAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): CountingAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const ports = { store: db.store, executor, issuer };
  const setter = new DeviceSetter(ports);
  const toggler = new DeviceToggler(ports, (deviceId, capability) =>
    db.store.state.value(deviceId, capability),
  );
  const handlers = {
    ...effectHandlers({
      setter,
      http: { request: unused },
      toggler,
      issuer,
      store: db.store,
      owned: { list: unused, write: unused },
      kept: { read: unused, write: unused },
      extra: {},
    }),
    ...deviceExtraHandlers({ setter, store: db.store, feed: db.store.feed, clock }),
  };
  const counts = { admissions: 0, inserts: 0 };
  const perform: Perform = (kind, params, mode) => {
    const handler = handlers[kind];
    if (handler === undefined) throw new Error(`no handler for ${kind}`);
    const run = testRun();
    return handler(params, request(kind, mode), {
      ...run,
      commands: (rows): void => {
        counts.inserts += 1;
        run.commands(rows);
      },
    });
  };
  const admit = executor.admit.bind(executor);
  executor.admit = <T>(
    deviceId: string | null,
    capability: string,
    work: () => Promise<T>,
  ): Promise<T> => {
    counts.admissions += 1;
    return admit(deviceId, capability, work);
  };
  return { db, room, lampIds, adapter, clock, perform, counts };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

function report(db: TestDatabase, deviceId: string, capability: string, value: JsonValue): void {
  db.store.state.write([
    { deviceId, capability, value, observedAt: new Date(NOW.getTime() + 100).toISOString() },
  ]);
}

describe('bulk device nodes send to every member at once', () => {
  it('sends a room light change to all lamps in one batch, without lane admissions, skipping the fan', async () => {
    const rig = await home();
    const release = rig.adapter.close();
    const result = rig.perform('device.set', {
      target: { room: rig.room.id, families: ['light'] },
      control: 'power',
      to: true,
    });
    await settle();
    expect(rig.adapter.executed).toHaveLength(LAMPS);
    expect(rig.counts.inserts).toBe(1);
    expect(rig.counts.admissions).toBe(0);
    release();
    const done = await result;
    expect(done).toMatchObject({ ok: true });
    expect(done.ok && done.value['sent']).toHaveLength(LAMPS);
  });

  it('toggles a whole group at once and reads each member inside its lane', async () => {
    const rig = await home();
    const members = rig.lampIds.slice(0, 3);
    const group = rig.db.store.deviceGroups.create({ name: 'Desk', device_ids: members });
    for (const id of members) report(rig.db, id, 'power', false);
    const release = rig.adapter.close();
    const result = rig.perform('device.toggle', { target: { group: group.id }, control: 'power' });
    await settle();
    expect(rig.adapter.executed.map((command) => command.value)).toStrictEqual([true, true, true]);
    expect(rig.counts.inserts).toBe(1);
    release();
    expect(await result).toMatchObject({ ok: true });
  });

  it('keeps a room fade on the clock while earlier sends are still out', async () => {
    const rig = await home();
    const release = rig.adapter.close();
    const result = rig.perform('device.fade', {
      target: { room: rig.room.id, families: ['light'] },
      control: 'brightness',
      from: 10,
      to: 40,
      over: 3000,
    });
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 1000).toISOString());
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 2000).toISOString());
    await settle();
    expect(rig.counts.inserts).toBe(3);
    expect(rig.adapter.executed).toHaveLength(LAMPS);
    release();
    const done = await result;
    expect(done).toMatchObject({ ok: true, value: { value: 40 } });
    expect(rig.adapter.executed.slice(-LAMPS).map((command) => command.value)).toStrictEqual(
      Array.from({ length: LAMPS }, () => 40),
    );
  });

  it('runs a scene with several controls per lamp as one together call per lamp', async () => {
    const rig = await home();
    const scene = captureScene(rig.db.store, {
      name: 'Evening',
      overwrite: false,
      actions: rig.lampIds.flatMap((deviceId) => [
        { type: 'command' as const, deviceId, capability: 'brightness', value: 30 },
        { type: 'command' as const, deviceId, capability: 'power', value: true },
      ]),
    });
    expect(await rig.perform('scene.run', { scene: scene.id })).toMatchObject({ ok: true });
    expect(rig.adapter.together).toHaveLength(LAMPS);
    expect(rig.adapter.together.every((commands) => commands.length === 2)).toBe(true);
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('action modes', () => {
  it('defaults plain device commands to fire and forget and everything else to wait', () => {
    expect(modeOf(request('device.set'))).toBe('fire_and_forget');
    expect(modeOf(request('scene.run'))).toBe('fire_and_forget');
    expect(modeOf(request('device.set', 'wait_for_result'))).toBe('wait_for_result');
    expect(modeOf(request('notify.ask'))).toBe('wait_for_result');
    expect(modeOf(request('notify.ask', 'fire_and_forget'))).toBe('wait_for_result');
    expect(NODE_POLICY.parse({ mode: 'wait_for_result' })).toStrictEqual({
      mode: 'wait_for_result',
    });
  });

  it('honours a kind that declares its own modes, exactly as the editor does', () => {
    const base = NODE_REGISTRY.get('notify.ask');
    if (base === undefined) throw new Error('notify.ask is not registered');
    const plugin: NodeKind = {
      ...base,
      id: 'plugin.custom',
      modes: { default: 'fire_and_forget', allowed: ['fire_and_forget', 'wait_for_result'] },
    };
    const get = NODE_REGISTRY.get;
    const spy = vi
      .spyOn(NODE_REGISTRY, 'get')
      .mockImplementation((id) => (id === plugin.id ? plugin : get(id)));
    try {
      for (const chosen of [undefined, 'fire_and_forget', 'wait_for_result'] as const) {
        expect(modeOf(request(plugin.id, chosen))).toBe(runModeOf(plugin, chosen));
      }
      expect(modeOf(request(plugin.id))).toBe('fire_and_forget');
    } finally {
      spy.mockRestore();
    }
  });

  it('continues a fire and forget change once it is sent, with no state report', async () => {
    const rig = await home();
    const result = await rig.perform('device.set', {
      target: { devices: rig.lampIds.slice(0, 2) },
      control: 'power',
      to: true,
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('waits for every device to report the value when the node waits for the result', async () => {
    const rig = await home();
    const [first = '', second = ''] = rig.lampIds;
    let finished = false;
    const result = rig
      .perform(
        'device.set',
        { target: { devices: [first, second] }, control: 'power', to: true },
        'wait_for_result',
      )
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(rig.adapter.executed).toHaveLength(2);
    report(rig.db, first, 'power', true);
    await settle();
    expect(finished).toBe(false);
    report(rig.db, second, 'power', true);
    expect(await result).toMatchObject({ ok: true });
  });

  it('fails with Timeout when a device never confirms within the command budget', async () => {
    const rig = await home();
    const [first = ''] = rig.lampIds;
    const result = rig.perform(
      'device.set',
      { target: { device: first }, control: 'power', to: true },
      'wait_for_result',
    );
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 20_000).toISOString());
    expect(await result).toMatchObject({ ok: false, class: 'Timeout' });
  });
});
