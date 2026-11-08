import { createSocket } from 'node:dgram';
import {
  CommandRefusedError,
  JSON_VALUE,
  VACUUM_CLEANING_OPTIONS,
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_CLEAN_ZONES_KEY,
  VACUUM_MAP_KEY,
  VACUUM_MODES,
  VACUUM_POSE_KEY,
  validateCommand,
  type CapabilityKey,
  type JsonValue,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  MIOT_SPEC,
  modelFromSpec,
  parseToken,
  vacuumProperty,
  type DeviceModel,
} from '@smarteverything/xiaomi';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { lanIo, type DeviceIo } from '../../src/adapters/xiaomi/device-io';
import { familyHooks } from '../../src/adapters/xiaomi/family-hooks';
import { MessageIds, MiioClient } from '../../src/adapters/xiaomi/miio-client';
import { discoveredDevice, type InventoryEntry } from '../../src/adapters/xiaomi/inventory';
import {
  CLEAN_MODES,
  SUCTION_LEVELS,
  VACUUM_CLEANING_CAPABILITY,
  WATER_LEVELS,
  vacuumActionKey,
  vacuumPropertyKey,
} from '../../src/vacuum/capabilities';
import { vacuumFamilyCommands, vacuumDerivedStates } from '../../src/vacuum/command-service';
import { FakeVacuum, type VacuumIdentity } from '../support/fake-vacuum';
import { until } from '../support/wait';
import { dependencies, routedFetch } from '../xiaomi/harness';

const TOKEN = '0123456789abcdef0123456789abcdef';
const HOST = '127.0.0.7';
const IDENTITY: VacuumIdentity = { did: '5550002', uid: '4440003' };
const MODEL = 'xiaomi.vacuum.pv11gl';
const SPEC = new URL(
  '../../../../packages/xiaomi/test/fixtures/vacuum/pv11gl-spec.json',
  import.meta.url,
);
const ROOMS_KEY = vacuumPropertyKey('room-information');
const READING = z.tuple([z.object({ value: JSON_VALUE.optional() })]);

let vacuum: FakeVacuum;
let client: MiioClient;
let io: DeviceIo;
let model: DeviceModel;

function entryOf(cloudModel: string, kind: DeviceModel['kind'] = 'vacuum'): InventoryEntry {
  return {
    cloud: {
      did: IDENTITY.did,
      name: 'Robot',
      model: cloudModel,
      token: null,
      ip: null,
      mac: null,
      parentDid: null,
      online: true,
      specType: null,
    },
    room: null,
    spec: null,
    model: { ...model, kind },
    specProblem: null,
    ptz: null,
  };
}

function commands(): NonNullable<ReturnType<typeof vacuumFamilyCommands>> {
  const found = vacuumFamilyCommands(entryOf(MODEL));
  if (found === null) throw new Error('the pv11gl has no vacuum commands');
  return found;
}

async function liveRoomText(): Promise<JsonValue> {
  const property = vacuumProperty('vacuum', 'room-information');
  const [first] = READING.parse(
    await client.call('get_properties', [
      { did: IDENTITY.did, siid: property.siid, piid: property.piid },
    ]),
  );
  return first.value ?? null;
}

async function run(capability: CapabilityKey, value: JsonValue): Promise<JsonValue> {
  const rooms = await liveRoomText();
  return commands().execute(capability, value, io, (key) =>
    key === ROOMS_KEY ? rooms : undefined,
  );
}

function methods(): string[] {
  return vacuum.requests.map(({ method }) => method);
}

beforeEach(async () => {
  model = modelFromSpec(MIOT_SPEC.parse(JSON.parse(readFileSync(SPEC, 'utf8'))));
  vacuum = new FakeVacuum({ host: HOST, deviceId: 0x0a0b0c0f, token: TOKEN, ...IDENTITY });
  const port = await vacuum.start();
  client = new MiioClient({
    host: HOST,
    port,
    token: parseToken(TOKEN),
    socket: createSocket('udp4'),
    timing: dependencies(routedFetch([]), port).timing,
    now: (): number => Date.now(),
    log: new Logger('tool.xiaomi-test'),
    messageIds: new MessageIds(0),
  });
  io = lanIo(IDENTITY.did, client);
  const rooms = vacuum.properties.get('2.16');
  vacuum.properties.set('2.16', z.string().parse(rooms).replace('"map_uid":N', '"map_uid":1'));
});

afterEach(async () => {
  await client.close();
  await vacuum.stop();
});

describe('the vacuum capabilities of the family registry', () => {
  it('adds the cleaning, room, zone, map and pose capabilities to the pv11gl', () => {
    const device = discoveredDevice(
      entryOf(MODEL),
      {
        transport: 'lan',
        online: true,
        reason: 'test',
        updates: 'push',
        pushSource: null,
        pushSince: null,
      },
      { userId: '1', region: 'de' },
      new Set<string>(),
    );
    const synthetic = device.capabilities.filter((capability) =>
      [
        'cleaning',
        VACUUM_CLEAN_ROOMS_KEY,
        VACUUM_CLEAN_ZONES_KEY,
        VACUUM_MAP_KEY,
        VACUUM_POSE_KEY,
      ].includes(capability.key),
    );
    expect(synthetic.map(({ key, access }) => [key, access])).toStrictEqual([
      ['cleaning', 'read_write'],
      [VACUUM_CLEAN_ROOMS_KEY, 'write'],
      [VACUUM_CLEAN_ZONES_KEY, 'write'],
      [VACUUM_MAP_KEY, 'read'],
      [VACUUM_POSE_KEY, 'read'],
    ]);
    expect(vacuumActionKey('get-vacuum-route')).toBe('raw:action.2.47');
    expect(device.capabilities.filter(({ key }) => key === 'cleaning')).toHaveLength(1);
  });

  it('drops the pose capability when the model binds no route action', () => {
    const bare = { ...entryOf(MODEL), model: { ...model, bindings: new Map() } };
    const device = discoveredDevice(
      bare,
      {
        transport: 'lan',
        online: true,
        reason: 'test',
        updates: 'push',
        pushSource: null,
        pushSince: null,
      },
      { userId: '1', region: 'de' },
      new Set<string>(),
    );
    const keys = device.capabilities.map(({ key }) => key);
    expect(keys).toContain(VACUUM_MAP_KEY);
    expect(keys).not.toContain(VACUUM_POSE_KEY);
  });

  it('gives another vacuum model nothing synthetic and no command hooks', () => {
    const other = entryOf('zhimi.vacuum.other');
    expect(vacuumFamilyCommands(other)).toBeNull();
    expect(familyHooks('vacuum').commands(other)).toBeNull();
    expect(familyHooks('vacuum').commands(entryOf(MODEL))).not.toBeNull();
    expect(familyHooks('laundry').commands(entryOf(MODEL))).toBeNull();
    const device = discoveredDevice(
      other,
      {
        transport: 'lan',
        online: true,
        reason: 'test',
        updates: 'push',
        pushSource: null,
        pushSince: null,
      },
      { userId: '1', region: 'de' },
      new Set<string>(),
    );
    expect(device.capabilities.map(({ key }) => key)).not.toContain(VACUUM_CLEAN_ROOMS_KEY);
  });

  it('keeps the option tables equal to the robot catalogue and the domain modes', () => {
    const values = (name: string): number[] =>
      vacuumProperty('vacuum', name).values.map(({ value }) => value);
    expect(Object.values(SUCTION_LEVELS)).toStrictEqual(values('mode'));
    expect(Object.values(WATER_LEVELS)).toStrictEqual(values('mop-water-output-level'));
    expect(Object.values(CLEAN_MODES).sort()).toStrictEqual(values('sweep-mop-type'));
    expect(VACUUM_MODES.map(({ mode }) => CLEAN_MODES[mode])).toStrictEqual(
      VACUUM_MODES.map(({ value }) => value),
    );
    expect(VACUUM_CLEANING_CAPABILITY.value).toStrictEqual({
      kind: 'enum',
      options: [...VACUUM_CLEANING_OPTIONS],
    });
  });
});

describe('cleaning rooms', () => {
  it('resolves names against the live room list and sends the piid-tagged room input', async () => {
    const reply = await run(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['room4', 'Room2'] });
    expect(reply).toStrictEqual([]);
    expect(vacuum.actions).toStrictEqual([
      { siid: 2, aiid: 16, inputs: [{ piid: 15, value: '[3,4]' }], outcome: 'changed' },
    ]);
    expect(methods()).toStrictEqual(['get_properties', 'action']);
    await until(() => vacuum.properties.get('2.2') === 4);
  });

  it('sends a single id as the bare id text and accepts ids and numeric text', async () => {
    await run(VACUUM_CLEAN_ROOMS_KEY, { rooms: [3] });
    expect(vacuum.actions[0]?.inputs).toStrictEqual([{ piid: 15, value: '3' }]);
    await run(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['5', 'Room4', 3] });
    expect(vacuum.actions[1]?.inputs).toStrictEqual([{ piid: 15, value: '[5,3]' }]);
  });

  it('writes the run options in one property batch before the single action', async () => {
    await run(VACUUM_CLEAN_ROOMS_KEY, {
      rooms: ['Room1'],
      repeats: 2,
      suction: 'turbo',
      water: 'level_2',
      mode: 'sweep_then_mop',
    });
    expect(methods()).toStrictEqual(['get_properties', 'set_properties', 'action']);
    const set = vacuum.requests[1]?.params;
    expect(set).toStrictEqual([
      { did: IDENTITY.did, siid: 2, piid: 4, value: 4 },
      { did: IDENTITY.did, siid: 2, piid: 8, value: 2 },
      { did: IDENTITY.did, siid: 2, piid: 9, value: 4 },
      { did: IDENTITY.did, siid: 2, piid: 10, value: 2 },
    ]);
    expect(vacuum.writes).toHaveLength(4);
    expect(vacuum.actions[0]?.inputs).toStrictEqual([{ piid: 15, value: '6' }]);
  });

  it('refuses an unknown room, naming the rooms the robot has, and sends nothing', async () => {
    const error = await run(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['Attic'] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommandRefusedError);
    expect(String(error)).toContain('Room2 (4)');
    expect(methods()).toStrictEqual(['get_properties']);
  });

  it.each([
    { rooms: [] },
    { rooms: ['Room1'], suction: 'loud' },
    { rooms: ['Room1'], repeats: 4 },
    { rooms: ['Room1'], speed: 1 },
    { suction: 'turbo' },
  ])('refuses the malformed arguments %j', async (value) => {
    await expect(run(VACUUM_CLEAN_ROOMS_KEY, value)).rejects.toBeInstanceOf(CommandRefusedError);
    expect(methods()).toStrictEqual(['get_properties']);
  });

  it('refuses room names when the robot has not reported its rooms', async () => {
    await expect(
      commands().execute(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['Room1'] }, io, () => undefined),
    ).rejects.toThrow('has not reported its rooms');
    expect(methods()).toStrictEqual([]);
  });

  it('reads the room list of the room_attrs shape as well', async () => {
    const text = JSON.stringify({ room_attrs: [{ id: 9, room_name: 'Hall' }] });
    await commands().execute(VACUUM_CLEAN_ROOMS_KEY, { rooms: ['hall'] }, io, () => text);
    expect(vacuum.actions[0]?.inputs).toStrictEqual([{ piid: 15, value: '9' }]);
  });
});

describe('cleaning zones', () => {
  it('converts metres to millimetres in the proven corner order and tags piid 12', async () => {
    await run(VACUUM_CLEAN_ZONES_KEY, { zones: [{ x1: 2.5, y1: -0.5, x2: 1, y2: 1.25 }] });
    const region = [1000, 1250, 1000, -500, 2500, -500, 2500, 1250];
    expect(vacuum.actions).toStrictEqual([
      {
        siid: 2,
        aiid: 37,
        inputs: [{ piid: 12, value: JSON.stringify([{ blocks_region: region, blocks_attr: 0 }]) }],
        outcome: 'changed',
      },
    ]);
    await until(() => vacuum.properties.get('2.5') === 2);
    expect(methods()).toStrictEqual(['get_properties', 'action']);
  });

  it('sends the repeat count as a property write before the zones', async () => {
    await run(VACUUM_CLEAN_ZONES_KEY, { zones: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], repeats: 2 });
    expect(methods()).toStrictEqual(['get_properties', 'set_properties', 'action']);
    expect(vacuum.writes).toStrictEqual([{ siid: 2, piid: 8, value: 2 }]);
  });

  it.each([
    { zones: [] },
    { zones: [{ x1: 0, y1: 0, x2: 1 }] },
    { zones: Array.from({ length: 6 }, () => ({ x1: 0, y1: 0, x2: 1, y2: 1 })) },
    { zones: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], suction: 'turbo' },
  ])('refuses the malformed arguments %j', async (value) => {
    await expect(run(VACUUM_CLEAN_ZONES_KEY, value)).rejects.toBeInstanceOf(CommandRefusedError);
    expect(methods()).toStrictEqual(['get_properties']);
  });
});

describe('the cleaning command', () => {
  it.each([
    ['start', 2, 1],
    ['pause', 2, 7],
    ['resume', 2, 8],
    ['dock', 2, 3],
    ['stop', 2, 2],
  ] as const)(
    'maps %s to its robot action with no inputs and no read-back',
    async (word, siid, aiid) => {
      const reply = await commands().execute('cleaning', word, io, () => undefined);
      expect(reply).toStrictEqual([]);
      expect(vacuum.actions.map(({ siid: s, aiid: a, inputs }) => [s, a, inputs])).toStrictEqual([
        [siid, aiid, []],
      ]);
      expect(methods()).toStrictEqual(['action']);
    },
  );

  it('refuses a reading word and an unknown word as commands', async () => {
    await expect(commands().execute('cleaning', 'charging', io, () => undefined)).rejects.toThrow(
      'is a reading, not a command',
    );
    await expect(commands().execute('cleaning', 7, io, () => undefined)).rejects.toBeInstanceOf(
      CommandRefusedError,
    );
    expect(methods()).toStrictEqual([]);
  });

  it('is accepted by the device validation with the shared option list', () => {
    const device = discoveredDevice(
      entryOf(MODEL),
      {
        transport: 'lan',
        online: true,
        reason: 'test',
        updates: 'push',
        pushSource: null,
        pushSince: null,
      },
      { userId: '1', region: 'de' },
      new Set<string>(),
    );
    expect(validateCommand(device, { capability: 'cleaning', value: 'dock' })).toBe('dock');
    expect(() => validateCommand(device, { capability: 'cleaning', value: 'flying' })).toThrow();
    expect(
      validateCommand(device, { capability: VACUUM_CLEAN_ROOMS_KEY, value: { rooms: ['a'] } }),
    ).toStrictEqual({ rooms: ['a'] });
    expect(() => validateCommand(device, { capability: VACUUM_MAP_KEY, value: 'x' })).toThrow(
      'can only be read',
    );
  });
});

describe('the cleaning reading', () => {
  it('derives the coarse phase from the robot status and nothing from other keys', () => {
    const status = vacuumPropertyKey('status');
    expect(vacuumDerivedStates(status, 4)).toStrictEqual([
      { capability: 'cleaning', value: 'cleaning' },
    ]);
    expect(vacuumDerivedStates(status, 9)).toStrictEqual([
      { capability: 'cleaning', value: 'docked' },
    ]);
    expect(vacuumDerivedStates(status, 5)).toStrictEqual([
      { capability: 'cleaning', value: 'paused' },
    ]);
    expect(vacuumDerivedStates(status, 999)).toStrictEqual([]);
    expect(vacuumDerivedStates(vacuumPropertyKey('mode'), 4)).toStrictEqual([]);
  });
});
