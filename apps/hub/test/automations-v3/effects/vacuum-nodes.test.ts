import type {
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
  RoomRow,
} from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DeviceSetter, type DeviceSetRequest } from '../../../src/automations/effects/device-set';
import {
  VACUUM_COMMANDS,
  VACUUM_STATION_JOBS,
  vacuumEffects,
} from '../../../src/automations/effects/vacuum-nodes';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import {
  CLEAN_MODE_NAMES,
  CLEAN_ROOMS_ARGUMENTS,
  SUCTION_NAMES,
  VACUUM_CLEANING_CAPABILITY,
  VACUUM_CLEAN_ROOMS_CAPABILITY,
  WATER_NAMES,
} from '../../../src/vacuum/capabilities';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { FakeAdapter, LAMP } from '../../support/fake-provider';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

function action(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'write', value: { kind: 'action' } };
}

const STATION_KEYS: Readonly<Record<string, DeviceCapability['key']>> = {
  empty_dust: 'raw:action.2.18',
  wash_mop: 'raw:action.2.19',
  dry_mop: 'raw:action.2.20',
  stop_dry: 'raw:action.2.32',
};

const ROBOT: DiscoveredDevice = {
  ...LAMP,
  externalId: 'robot',
  name: 'Robot',
  kind: 'vacuum',
  model: 'xiaomi.vacuum.pv11gl',
  manufacturer: 'Xiaomi',
  online: true,
  capabilities: [
    VACUUM_CLEANING_CAPABILITY,
    VACUUM_CLEAN_ROOMS_CAPABILITY,
    action('raw:action.2.59', 'Spot cleaning'),
    ...Object.values(STATION_KEYS).map((key) => action(key, key)),
  ],
};

const BULB: DiscoveredDevice = { ...LAMP, externalId: 'bulb', name: 'Bulb' };

interface Rig {
  readonly db: TestDatabase;
  readonly adapter: FakeAdapter;
  readonly robot: string;
  readonly bulb: string;
  readonly room: (name: string) => string;
  readonly seen: DeviceSetRequest[];
  readonly perform: (
    kind: string,
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'command',
    ...(mode === undefined ? {} : { mode }),
  };
}

async function home(): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [ROBOT, BULB]);
  const adapter = new FakeAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): FakeAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const real = new DeviceSetter({ store: db.store, executor, issuer });
  const seen: DeviceSetRequest[] = [];
  const setter = {
    set: (...args: Parameters<DeviceSetter['set']>): ReturnType<DeviceSetter['set']> => {
      seen.push(args[0]);
      return real.set(...args);
    },
  };
  const handlers = vacuumEffects({ store: db.store, setter });
  const rooms = new Map<string, RoomRow>(
    ['Kitchen', 'Hall', 'Bedroom'].map((name, index) => [name, db.store.rooms.create(name, index)]),
  );
  return {
    db,
    adapter,
    robot: inventory.deviceOf('xiaomi', 'robot')?.id ?? '',
    bulb: inventory.deviceOf('xiaomi', 'bulb')?.id ?? '',
    room: (name): string => {
      const found = rooms.get(name);
      if (found === undefined) throw new Error(`no room ${name}`);
      return found.id;
    },
    seen,
    perform: (kind, params, mode): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params, mode), testRun());
    },
  };
}

function link(rig: Rig, mapRoomId: number, name: string, home: string): void {
  rig.db.store.vacuumRoomLinks.link(rig.robot, {
    mapRoomId,
    mapRoomName: name,
    roomId: rig.room(home),
  });
}

function sent(adapter: FakeAdapter): readonly (readonly [string, JsonValue])[] {
  return adapter.executed.map((command) => [command.capability, command.value]);
}

function failureOf(result: NodeResult): { readonly class: string; readonly message: string } {
  if (result.ok) throw new Error('the node did not fail');
  return { class: result.class, message: result.message };
}

const CLEANED = z.object({
  started: z.literal(true),
  rooms: z.array(z.object({ room: z.string() })),
  unlinkedRooms: z.array(z.object({ room: z.string() })),
});

function cleanedOf(result: NodeResult): z.infer<typeof CLEANED> {
  if (!result.ok) throw new Error(`the node failed: ${result.message}`);
  return CLEANED.parse(result.value);
}

function choiceIds(kind: string, port: string): readonly string[] {
  const found = NODE_REGISTRY.get(kind)?.inputs.find((each) => each.name === port)?.type;
  return found?.t === 'choice' ? found.options.map((option) => option.id) : [];
}

describe('vacuum.command', () => {
  it('maps start, pause, resume, stop and dock onto the cleaning control', async () => {
    const rig = await home();
    for (const word of ['start', 'pause', 'resume', 'stop', 'dock'])
      expect(
        await rig.perform('vacuum.command', { vacuum: { device: rig.robot }, action: word }),
      ).toMatchObject({ ok: true, value: { ok: true } });
    expect(sent(rig.adapter)).toStrictEqual([
      ['cleaning', 'start'],
      ['cleaning', 'pause'],
      ['cleaning', 'resume'],
      ['cleaning', 'stop'],
      ['cleaning', 'dock'],
    ]);
  });

  it('presses the spot clean action', async () => {
    const rig = await home();
    await rig.perform('vacuum.command', { vacuum: { device: rig.robot }, action: 'spot' });
    expect(sent(rig.adapter)).toStrictEqual([['raw:action.2.59', null]]);
  });

  it('fails with the error exit value on a device that is not a robot vacuum and sends nothing', async () => {
    const rig = await home();
    const result = await rig.perform('vacuum.command', {
      vacuum: { device: rig.bulb },
      action: 'start',
    });
    expect(failureOf(result).class).toBe('Refused');
    expect(rig.adapter.executed).toHaveLength(0);
  });

  it('rejects an action that is not offered', async () => {
    const rig = await home();
    const result = await rig.perform('vacuum.command', {
      vacuum: { device: rig.robot },
      action: 'explode',
    });
    expect(failureOf(result).class).toBe('Invalid');
    expect(rig.adapter.executed).toHaveLength(0);
  });

  it('hands the chosen run mode to the setter', async () => {
    const rig = await home();
    await rig.perform('vacuum.command', { vacuum: { device: rig.robot }, action: 'pause' });
    expect(rig.seen.at(-1)?.mode).toBe('fire_and_forget');
  });
});

describe('vacuum.station', () => {
  it('runs a station job through its role on the robot', async () => {
    const rig = await home();
    for (const job of ['empty_dust', 'wash_mop', 'dry_mop', 'stop_dry'])
      expect(
        await rig.perform('vacuum.station', { vacuum: { device: rig.robot }, action: job }),
      ).toMatchObject({ ok: true, value: { ok: true } });
    expect(sent(rig.adapter)).toStrictEqual(
      ['empty_dust', 'wash_mop', 'dry_mop', 'stop_dry'].map((job) => [
        STATION_KEYS[job] ?? '',
        null,
      ]),
    );
  });

  it('refuses a job the robot does not have and sends nothing', async () => {
    const rig = await home();
    const result = await rig.perform('vacuum.station', {
      vacuum: { device: rig.robot },
      action: 'eject',
    });
    expect(failureOf(result).class).toBe('Refused');
    expect(rig.adapter.executed).toHaveLength(0);
  });
});

describe('vacuum.clean_rooms', () => {
  it('sends the map rooms the home rooms are linked to with the chosen options', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    link(rig, 17, 'Hall', 'Hall');
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Hall') }, { room: rig.room('Kitchen') }],
      mode: 'sweep_then_mop',
      suction: 'strong',
      water: 'level_2',
      passes: 2,
    });
    expect(cleanedOf(result).rooms).toStrictEqual([
      { room: rig.room('Hall') },
      { room: rig.room('Kitchen') },
    ]);
    expect(cleanedOf(result).unlinkedRooms).toStrictEqual([]);
    expect(sent(rig.adapter)).toStrictEqual([
      [
        'raw:clean_rooms',
        {
          rooms: [17, 16],
          mode: 'sweep_then_mop',
          suction: 'strong',
          water: 'level_2',
          repeats: 2,
        },
      ],
    ]);
  });

  it('sends only the rooms and leaves out options that were not chosen', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Kitchen') }],
    });
    expect(sent(rig.adapter)).toStrictEqual([['raw:clean_rooms', { rooms: [16] }]]);
  });

  it('cleans the linked rooms and reports the unlinked ones without guessing', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Kitchen') }, { room: rig.room('Bedroom') }],
    });
    const cleaned = cleanedOf(result);
    expect(cleaned.rooms).toStrictEqual([{ room: rig.room('Kitchen') }]);
    expect(cleaned.unlinkedRooms).toStrictEqual([{ room: rig.room('Bedroom') }]);
    expect(sent(rig.adapter)).toStrictEqual([['raw:clean_rooms', { rooms: [16] }]]);
  });

  it('treats a link to a room that left the map as unlinked', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    link(rig, 17, 'Hall', 'Hall');
    rig.db.store.vacuumRoomLinks.reconcile(
      rig.robot,
      [{ id: 16, name: 'Kitchen' }],
      '2026-10-25T00:00:00.000Z',
    );
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Kitchen') }, { room: rig.room('Hall') }],
    });
    expect(cleanedOf(result).unlinkedRooms).toStrictEqual([{ room: rig.room('Hall') }]);
    expect(sent(rig.adapter)).toStrictEqual([['raw:clean_rooms', { rooms: [16] }]]);
  });

  it('fails with the room names and sends nothing when no room is linked', async () => {
    const rig = await home();
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Bedroom') }],
    });
    expect(failureOf(result)).toMatchObject({ class: 'Refused' });
    expect(failureOf(result).message).toContain('Bedroom');
    expect(rig.adapter.executed).toHaveLength(0);
  });

  it('cleans a room once when it is listed twice', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    const kitchen = { room: rig.room('Kitchen') };
    await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [kitchen, kitchen],
    });
    expect(sent(rig.adapter)).toStrictEqual([['raw:clean_rooms', { rooms: [16] }]]);
  });

  it('refuses a device that cannot clean rooms before looking at links', async () => {
    const rig = await home();
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.bulb },
      rooms: [{ room: rig.room('Kitchen') }],
    });
    expect(failureOf(result).class).toBe('Refused');
    expect(rig.adapter.executed).toHaveLength(0);
  });

  it('refuses more passes than the robot takes without sending', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    const result = await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Kitchen') }],
      passes: 9,
    });
    expect(failureOf(result).class).toBe('Invalid');
    expect(rig.adapter.executed).toHaveLength(0);
  });

  it('asks for the room to be sent in the run mode of the step', async () => {
    const rig = await home();
    link(rig, 16, 'Kitchen', 'Kitchen');
    await rig.perform('vacuum.clean_rooms', {
      vacuum: { device: rig.robot },
      rooms: [{ room: rig.room('Kitchen') }],
    });
    expect(rig.seen.at(-1)).toMatchObject({
      control: 'vacuum_clean_rooms',
      mode: 'fire_and_forget',
      target: { kind: 'devices', deviceIds: [rig.robot] },
    });
  });
});

describe('vacuum node choices match the robot', () => {
  it('uses the very choices the domain kinds offer', () => {
    expect(choiceIds('vacuum.command', 'action')).toStrictEqual([...VACUUM_COMMANDS]);
    expect(choiceIds('vacuum.station', 'action')).toStrictEqual([...VACUUM_STATION_JOBS]);
  });

  it('offers exactly the cleaning mode, suction and water the robot takes', () => {
    expect(choiceIds('vacuum.clean_rooms', 'mode')).toStrictEqual([...CLEAN_MODE_NAMES]);
    expect(choiceIds('vacuum.clean_rooms', 'suction')).toStrictEqual([...SUCTION_NAMES]);
    expect(choiceIds('vacuum.clean_rooms', 'water')).toStrictEqual([...WATER_NAMES]);
  });

  it('declares the passes range the robot accepts', () => {
    const passes = NODE_REGISTRY.get('vacuum.clean_rooms')?.inputs.find(
      (port) => port.name === 'passes',
    )?.type;
    const max = passes?.t === 'number' ? (passes.max ?? 0) : 0;
    expect(CLEAN_ROOMS_ARGUMENTS.safeParse({ rooms: [1], repeats: max }).success).toBe(true);
    expect(CLEAN_ROOMS_ARGUMENTS.safeParse({ rooms: [1], repeats: max + 1 }).success).toBe(false);
  });
});
