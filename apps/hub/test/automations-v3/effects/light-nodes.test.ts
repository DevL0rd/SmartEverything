import { setImmediate as nextTurn } from 'node:timers/promises';
import type { DeviceCommand, DiscoveredDevice, JsonValue, RoomRow } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { lightEffects } from '../../../src/automations/effects/light-nodes';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { LAMP } from '../../support/fake-provider';
import { captureLogs, testLogger } from '../../support/logs';
import { testRun } from './support';

const LIGHTS = 10;
const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

function bulb(index: number, overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    ...LAMP,
    provider: 'local',
    externalId: `wiz:bulb-${String(index)}`,
    name: `Bulb ${String(index)}`,
    capabilities: [
      ...LAMP.capabilities.filter((capability) => capability.key !== 'temperature'),
      {
        key: 'color_temperature',
        label: 'Colour temperature',
        access: 'read_write',
        value: { kind: 'number', min: 2200, max: 6500, step: 1, unit: 'K' },
      },
      {
        key: 'color',
        label: 'Colour',
        access: 'read_write',
        value: { kind: 'color' },
      },
    ],
    ...overrides,
  };
}

const FAN: DiscoveredDevice = {
  ...LAMP,
  provider: 'local',
  externalId: 'wiz:fan-1',
  kind: 'fan',
  name: 'Fan',
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  ],
};

function request(mode?: EffectRequest['mode']): EffectRequest {
  return {
    kind: 'light.set',
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

interface Calls {
  readonly together: DeviceCommand[][];
  readonly single: DeviceCommand[];
}

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly ids: readonly string[];
  readonly idOf: (externalId: string) => string;
  readonly clock: FakeClock;
  readonly calls: Calls;
  readonly counts: { inserts: number };
  readonly close: () => () => void;
  readonly run: (
    params: Record<string, JsonValue>,
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

async function home(extra: readonly DiscoveredDevice[] = []): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const room = db.store.rooms.create('Study', 0);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  const lights = Array.from({ length: LIGHTS }, (_, index) => bulb(index));
  await inventory.apply('local', [...lights, ...extra]);
  const idOf = (externalId: string): string => inventory.deviceOf('local', externalId)?.id ?? '';
  const calls: Calls = { together: [], single: [] };
  const gate: { current: Promise<void> | null } = { current: null };
  const drivers = new DeviceDriverRegistry();
  drivers.register({
    id: 'wiz',
    start: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
    execute: async (command): Promise<JsonValue> => {
      calls.single.push(command);
      if (gate.current !== null) await gate.current;
      return null;
    },
    executeTogether: async (commands): Promise<JsonValue> => {
      calls.together.push([...commands]);
      if (gate.current !== null) await gate.current;
      return null;
    },
  });
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers,
    adapters: { adapterFor: (): undefined => undefined },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handler = lightEffects({ store: db.store, clock, setter })['light.set'];
  const counts = { inserts: 0 };
  return {
    db,
    room,
    ids: lights.map((light) => idOf(light.externalId)),
    idOf,
    clock,
    calls,
    counts,
    close: () => {
      let release: () => void = () => undefined;
      gate.current = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate.current = null;
        release();
      };
    },
    run: (params, mode): Promise<NodeResult> => {
      if (handler === undefined) throw new Error('light.set is not registered');
      const run = testRun();
      return handler(params, request(mode), {
        ...run,
        commands: (rows): void => {
          counts.inserts += 1;
          run.commands(rows);
        },
      });
    },
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) await nextTurn();
}

function report(rig: Rig, deviceId: string, capability: string, value: JsonValue): void {
  rig.db.store.state.write([
    { deviceId, capability, value, observedAt: new Date(NOW.getTime() + 100).toISOString() },
  ]);
}

const WARM_WHITE = { colorTemperature: 2700, brightness: 40 };

describe('light.set sends every light at once', () => {
  it('sends warm white 40 percent to ten lights as one multi-control call each, all started before any acknowledgement', async () => {
    const rig = await home([FAN]);
    const release = rig.close();
    const result = rig.run({ target: { room: rig.room.id }, ...WARM_WHITE });
    await settle();
    expect(rig.calls.together).toHaveLength(LIGHTS);
    expect(rig.calls.single).toHaveLength(0);
    expect(rig.counts.inserts).toBe(LIGHTS);
    for (const batch of rig.calls.together) {
      expect(batch.map((command) => [command.capability, command.value])).toStrictEqual([
        ['brightness', 40],
        ['color_temperature', 2700],
      ]);
    }
    release();
    const done = await result;
    expect(done).toMatchObject({ ok: true });
    expect(done.ok && done.value['sent']).toHaveLength(LIGHTS);
    expect(done.ok && done.value['skipped']).toStrictEqual([
      { device: { device: rig.idOf('wiz:fan-1') }, reason: 'It is not a light.' },
    ]);
  });

  it('puts power last so the light changes while it is still in its old state', async () => {
    const rig = await home();
    const target = { device: rig.ids[0] ?? '' };
    expect(await rig.run({ target, power: 'on', brightness: 30 })).toMatchObject({ ok: true });
    expect(rig.calls.together[0]?.map((command) => command.capability)).toStrictEqual([
      'brightness',
      'power',
    ]);
  });

  it('turns lights off with a single control and leaves power alone when asked to keep it', async () => {
    const rig = await home();
    const target = { devices: rig.ids.slice(0, 2) };
    expect(await rig.run({ target, power: 'off' })).toMatchObject({ ok: true });
    expect(rig.calls.single.map((command) => [command.capability, command.value])).toStrictEqual([
      ['power', false],
      ['power', false],
    ]);
    expect(await rig.run({ target, power: 'keep', brightness: 20 })).toMatchObject({ ok: true });
    expect(rig.calls.single).toHaveLength(3 + 1);
  });

  it('passes a colour to lights that take one and ignores controls a light lacks', async () => {
    const white = bulb(99, {
      capabilities: LAMP.capabilities.filter((capability) => capability.key !== 'temperature'),
    });
    const rig = await home([white]);
    const result = await rig.run({
      target: { devices: [rig.idOf('wiz:bulb-0'), rig.idOf('wiz:bulb-99')] },
      color: 'red',
      brightness: 50,
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.calls.together).toHaveLength(1);
    expect(rig.calls.together[0]?.map((command) => command.capability)).toStrictEqual([
      'brightness',
      'color',
    ]);
    expect(rig.calls.single.map((command) => command.capability)).toStrictEqual(['brightness']);
  });
});

describe('light.set reports what it left out', () => {
  it('skips offline lights, non lights and lights with none of the controls, and fails when nothing was sent', async () => {
    const offline = bulb(98, { online: false });
    const dumb = bulb(97, {
      capabilities: [
        { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      ],
    });
    const rig = await home([offline, FAN, dumb]);
    const result = await rig.run({
      target: {
        devices: [
          rig.idOf('wiz:bulb-0'),
          rig.idOf('wiz:bulb-98'),
          rig.idOf('wiz:fan-1'),
          rig.idOf('wiz:bulb-97'),
        ],
      },
      brightness: 10,
    });
    expect(result).toMatchObject({ ok: true });
    const skipped = result.ok ? result.value['skipped'] : null;
    expect(skipped).toStrictEqual([
      { device: { device: rig.idOf('wiz:bulb-98') }, reason: 'It is offline.' },
      { device: { device: rig.idOf('wiz:fan-1') }, reason: 'It is not a light.' },
      { device: { device: rig.idOf('wiz:bulb-97') }, reason: 'It has none of brightness.' },
    ]);
    expect(
      await rig.run({ target: { devices: [rig.idOf('wiz:fan-1')] }, brightness: 10 }),
    ).toMatchObject({ ok: false, class: 'Refused' });
  });

  it('refuses nonsense before anything is sent', async () => {
    const rig = await home();
    const target = { room: rig.room.id };
    expect(await rig.run({ target })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.run({ target, color: 'red', colorTemperature: 3000 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.run({ target, color: 'not a colour at all' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.run({ target, brightness: 400 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(rig.calls.together).toHaveLength(0);
    expect(rig.calls.single).toHaveLength(0);
  });
});

describe('light.set fade', () => {
  it('steps the brightness itself, logged, with every light on the clock and the temperature sent at once', async () => {
    const logs = captureLogs();
    const rig = await home();
    for (const id of rig.ids) report(rig, id, 'brightness', 10);
    const release = rig.close();
    const result = rig.run({ target: { room: rig.room.id }, ...WARM_WHITE, transition: 3000 });
    await settle();
    expect(rig.calls.together).toHaveLength(0);
    expect(rig.calls.single).toHaveLength(LIGHTS * 2);
    expect(rig.counts.inserts).toBe(LIGHTS * 2);
    expect(logs.events().filter((event) => event === 'light.set.transition_fallback')).toHaveLength(
      1,
    );
    rig.clock.advanceTo(new Date(NOW.getTime() + 1000).toISOString());
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 2000).toISOString());
    await settle();
    expect(rig.counts.inserts).toBe(LIGHTS * 4);
    expect(rig.calls.single).toHaveLength(LIGHTS * 2);
    release();
    expect(await result).toMatchObject({ ok: true });
    expect(rig.calls.single.slice(-LIGHTS).map((command) => command.value)).toStrictEqual(
      Array.from({ length: LIGHTS }, () => 40),
    );
  });

  it('does not fade a light that is being turned off', async () => {
    const rig = await home();
    for (const id of rig.ids) report(rig, id, 'brightness', 10);
    const result = await rig.run({
      target: { room: rig.room.id },
      power: 'off',
      brightness: 5,
      transition: 3000,
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.calls.together).toHaveLength(LIGHTS);
    expect(rig.calls.single).toHaveLength(0);
  });
});

describe('light.set run modes', () => {
  it('continues once the sends are done without waiting for a state report', async () => {
    const rig = await home();
    expect(await rig.run({ target: { room: rig.room.id }, ...WARM_WHITE })).toMatchObject({
      ok: true,
    });
  });

  it('waits for every light to report every control, then finishes', async () => {
    const rig = await home();
    const [first = '', second = ''] = rig.ids;
    let finished = false;
    const result = rig
      .run({ target: { devices: [first, second] }, ...WARM_WHITE }, 'wait_for_result')
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(rig.calls.together).toHaveLength(2);
    report(rig, first, 'brightness', 40);
    report(rig, first, 'color_temperature', 2700);
    report(rig, second, 'brightness', 40);
    await settle();
    expect(finished).toBe(false);
    report(rig, second, 'color_temperature', 2700);
    expect(await result).toMatchObject({ ok: true });
  });

  it('fails with Timeout when a light never confirms within the command budget', async () => {
    const rig = await home();
    const result = rig.run(
      { target: { device: rig.ids[0] ?? '' }, ...WARM_WHITE },
      'wait_for_result',
    );
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 20_000).toISOString());
    expect(await result).toMatchObject({ ok: false, class: 'Timeout' });
  });
});
