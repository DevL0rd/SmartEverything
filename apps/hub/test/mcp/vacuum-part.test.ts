import {
  API_ENDPOINTS,
  ApiError,
  CAPABILITY_KEY,
  MODEL_OVERRIDES,
  VACUUM_CLEANING_OPTIONS,
  catalogueEntryOf,
  isStandardCapability,
  VACUUM_SCENE,
  type ClientRow,
  type DeviceCapability,
  type EndpointName,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { deviceDetails, readDevice } from '../../src/extensions/mcp/tools/devices';
import type { ToolContext } from '../../src/extensions/mcp/tools/registry';
import { compactVacuumMap } from '../../src/extensions/mcp/tools/vacuum-map-compact';
import { operationView } from '../../src/extensions/mcp/tools/operation-views';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { captureLogs } from '../support/logs';
import { OWNER } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-24T08:10:00.000Z';
const AT = '2026-10-24T08:00:00.000Z';
const MODEL = 'xiaomi.vacuum.pv11gl';

const ROOMS = JSON.stringify({
  room_attrs: [
    { id: 3, room_name: 'Kitchen' },
    { id: 4, room_name: 'Hall' },
  ],
});

const READINGS: Readonly<Record<string, JsonValue>> = {
  'raw:2.2': 4,
  battery: 64,
  'raw:2.5': 2,
  'raw:2.4': 1,
  'raw:2.89': 35,
  'raw:2.40': JSON.stringify({ rooms: [3], zones: [] }),
  'raw:2.16': ROOMS,
  'raw:2.18': JSON.stringify({ mode: 3, progress: 20 }),
  'raw:12.1': 75,
  'raw:21.6': true,
};

const TEXT_KEYS: ReadonlySet<string> = new Set(['raw:2.40', 'raw:2.16', 'raw:2.18']);

function descriptorOf(key: string): DeviceCapability['value'] {
  const kind = isStandardCapability(key) ? catalogueEntryOf(key).kind : null;
  if (TEXT_KEYS.has(key) || kind === 'text') return { kind: 'text', maxLength: 4000 };
  if (key === 'raw:21.6' || kind === 'boolean') return { kind: 'boolean' };
  if (key.startsWith('raw:action.')) return { kind: 'action', arguments: [] };
  if (kind === 'enum') return { kind: 'enum', options: [...VACUUM_CLEANING_OPTIONS] };
  if (kind === 'action') return { kind: 'action', arguments: [] };
  return { kind: 'number', min: 0, max: 100_000, step: 1 };
}

function capabilityOf(key: string): DeviceCapability {
  return { key: CAPABILITY_KEY.parse(key), label: key, access: 'read', value: descriptorOf(key) };
}

const SCENE: VacuumScene = VACUUM_SCENE.parse({
  index: 7,
  slot: 'current',
  name: 'Home',
  fetchedAt: AT,
  bounds: { minX: -1, minY: -1, maxX: 6, maxY: 5 },
  rooms: [
    {
      id: 3,
      name: 'Kitchen',
      colour: 1,
      floor: 0,
      hidden: false,
      areaM2: 12.345,
      label: { x: 1, y: 1 },
      rings: [
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
          { x: 0, y: 3 },
        ],
      ],
      settings: null,
    },
  ],
  walls: [],
  doors: [],
  carpets: [],
  furniture: [],
  objects: [],
  zones: [
    {
      id: 1,
      kind: 'no_go',
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
    },
  ],
  dock: { x: 0.5, y: 0.5, yaw: 1.5708 },
  robot: { x: 2, y: 1, yaw: 0 },
  trail: [{ mopping: false, points: [{ x: 0, y: 0 }] }],
});

const LAST_CLEAN = {
  id: 'clean-1',
  startedAt: '2026-10-23T08:00:00.000Z',
  endedAt: '2026-10-23T08:40:00.000Z',
  seconds: 2400,
  areaM2: 31.04,
  scope: 'Global',
  mode: 'Sweep',
  rooms: [{ id: 3, name: 'Kitchen' }],
  outcome: 'finished',
  batteryStart: 100,
  batteryEnd: 60,
};

let opened: TestStore;
let owner: ClientRow;
let replies: Partial<Record<EndpointName, () => unknown>>;
let asked: EndpointName[];

function context(): OperatingContext & Pick<ToolContext, 'clock'> {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: owner.id, profileId: opened.store.profiles.first().id, chatId: null },
    clock: { ...systemClock, now: () => new Date(NOW) },
    operations: {
      run: (name, _caller, input): Promise<unknown> => {
        API_ENDPOINTS[name].params.parse(input.params ?? {});
        asked.push(name);
        const reply = replies[name];
        return reply === undefined
          ? Promise.reject(new Error(`unexpected ${name}`))
          : Promise.resolve().then(reply);
      },
    },
  };
}

function add(kind: 'vacuum' | 'light', model: string, keys: readonly string[]): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: `${kind}-${model}`,
      parentId: null,
      kind,
      name: kind === 'vacuum' ? 'Robot' : 'Lamp',
      model,
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: keys.map(capabilityOf),
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The device was not stored.');
  return row.id;
}

function addRobot(readings: Readonly<Record<string, JsonValue>> = READINGS): string {
  const id = add('vacuum', MODEL, Object.keys(readings));
  opened.store.state.write(
    Object.entries(readings).map(([capability, value]) => ({
      deviceId: id,
      capability,
      value,
      observedAt: AT,
    })),
  );
  return id;
}

function partOf(id: string): Record<string, unknown> {
  const device = deviceDetails(opened.store, null, OWNER, placedDevice(opened.store, null, id))[
    'device'
  ];
  if (typeof device !== 'object' || device === null) throw new Error('No device part.');
  const part: unknown = Object.fromEntries(Object.entries(device))['vacuum'];
  if (typeof part !== 'object' || part === null) throw new Error('No vacuum part.');
  return Object.fromEntries(Object.entries(part));
}

const READ = z.looseObject({
  device: z.looseObject({ vacuum: z.unknown().optional() }),
  capabilities: z.array(
    z.looseObject({
      key: z.string(),
      tier: z.string(),
      danger: z.string(),
      destructive: z.boolean(),
    }),
  ),
});

async function readTool(id: string): Promise<z.infer<typeof READ>> {
  return READ.parse(await readDevice(context(), id));
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  asked = [];
  replies = {
    getVacuumScene: (): unknown => SCENE,
    listVacuumCleans: (): unknown => ({ cleans: [LAST_CLEAN] }),
  };
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
});

afterEach(async () => {
  await opened.close();
});

describe('what the AI reads about a robot vacuum without loading the map', () => {
  it('shows the phase, status words, battery, job, rooms, station, consumables and camera', () => {
    const part = partOf(addRobot());
    expect(part).toMatchObject({
      phase: 'cleaning',
      awake: true,
      battery_percent: 64,
      job: { rooms: ['Kitchen'], zones: 0, progress_percent: 35 },
      rooms: [
        { id: 3, name: 'Kitchen', area_m2: null },
        { id: 4, name: 'Hall', area_m2: null },
      ],
      zones: null,
      station: { mode: 'wash_mop', progress: 20 },
      camera: { stream: false },
    });
    expect(part['status']).toEqual(expect.any(String));
    expect(part['consumables']).toEqual([expect.objectContaining({ label: 'Main brush life' })]);
    expect(part['problems']).toBeUndefined();
  });

  it('says why a value cannot be read instead of leaving it out', () => {
    const part = partOf(addRobot({ ...READINGS, 'raw:2.40': '{"rooms":"x"}' }));
    expect(part['job']).toBeNull();
    expect(part['schedules']).toBeUndefined();
    expect(part['problems']).toEqual([expect.any(String)]);
  });
});

describe('what device_read loads for a robot vacuum', () => {
  it('adds the rooms with their area, the zones, the dock, the robot, the map age and the last clean', async () => {
    const result = await readTool(addRobot());
    expect(result.device.vacuum).toMatchObject({
      rooms: [
        {
          id: 3,
          name: 'Kitchen',
          area_m2: 12.3,
          hidden: false,
          min: { x: 0, y: 0 },
          max: { x: 4, y: 3 },
        },
      ],
      zones: [{ id: 1, kind: 'no_go' }],
      map: {
        index: 7,
        age_seconds: 600,
        dock: { x: 0.5, y: 0.5, yaw: 1.57 },
        robot: { x: 2, y: 1, yaw: 0 },
      },
      last_clean: { seconds: 2400, area_m2: 31, rooms: ['Kitchen'], outcome: 'finished' },
    });
    expect(asked.sort()).toEqual(['getVacuumScene', 'listVacuumCleans']);
  });

  it('says the map is unavailable when the hub has none', async () => {
    replies.getVacuumScene = (): unknown => {
      throw new ApiError('not_found', 'The robot has no current map to show yet.');
    };
    const result = await readTool(addRobot());
    expect(result.device.vacuum).toMatchObject({
      map: { loaded: 'The robot has no current map to show yet.' },
    });
  });

  it('does not touch the robot routes for any other device', async () => {
    const result = await readTool(add('light', 'yeelink.light.lamp1', ['power']));
    expect(asked).toEqual([]);
    expect(result.device).not.toHaveProperty('vacuum');
    expect(result.device).not.toHaveProperty('television');
  });
});

describe('the size of what the AI reads', () => {
  it('stays compact for the whole robot with every capability listed and every value set', async () => {
    const keys = Object.keys(MODEL_OVERRIDES[MODEL]?.capabilities ?? {});
    const id = add('vacuum', MODEL, [...new Set([...keys, ...Object.keys(READINGS)])]);
    opened.store.state.write(
      Object.entries(READINGS).map(([capability, value]) => ({
        deviceId: id,
        capability,
        value,
        observedAt: AT,
      })),
    );
    const result = await readTool(id);
    const bytes = Buffer.byteLength(JSON.stringify(result));
    const partBytes = Buffer.byteLength(JSON.stringify(result.device.vacuum));
    const shown = result.capabilities.filter((capability) => capability.tier !== 'hidden').length;
    process.stdout.write(
      `vacuum device_read bytes ${String(bytes)} part bytes ${String(partBytes)} capabilities ${String(result.capabilities.length)} not hidden ${String(shown)}\n`,
    );
    expect(partBytes).toBeLessThan(3000);
    expect(bytes).toBeLessThan(120_000);
  });
});

describe('which capabilities the AI is told are destructive', () => {
  it('marks consumable resets and map deletion and leaves start and dock unmarked', async () => {
    const keys = [
      'raw:action.2.1',
      'raw:action.2.3',
      'raw:action.12.1',
      'raw:action.13.1',
      'raw:action.10.1',
      'raw:action.10.2',
    ];
    const result = await readTool(add('vacuum', MODEL, keys));
    const marked = Object.fromEntries(
      result.capabilities.map((capability) => [
        capability.key,
        [capability.danger, capability.destructive],
      ]),
    );
    expect(marked).toEqual({
      'raw:action.2.1': ['none', false],
      'raw:action.2.3': ['none', false],
      'raw:action.12.1': ['typed', true],
      'raw:action.13.1': ['typed', true],
      'raw:action.10.1': ['typed', true],
      'raw:action.10.2': ['typed', true],
    });
  });
});

describe('the compact map', () => {
  it('lists rooms with ids, names, areas and bounds, the dock, the robot and the zones, never the outlines or the trail', () => {
    const map = compactVacuumMap(SCENE);
    expect(map).toMatchObject({
      version: '7:current',
      unit: 'metres, y up',
      bounds: { min: { x: -1, y: -1 }, max: { x: 6, y: 5 } },
      dock: { x: 0.5, y: 0.5 },
      robot: { x: 2, y: 1 },
      rooms: [
        {
          id: 3,
          name: 'Kitchen',
          area_m2: 12.3,
          hidden: false,
          min: { x: 0, y: 0 },
          max: { x: 4, y: 3 },
        },
      ],
      zones: [{ id: 1, kind: 'no_go', min: { x: 1, y: 1 }, max: { x: 2, y: 2 } }],
    });
    const text = JSON.stringify(map);
    expect(text).not.toContain('rings');
    expect(text).not.toContain('trail');
    expect(Buffer.byteLength(text)).toBeLessThan(1000);
  });
});

describe('the AI scene read', () => {
  it('answers the getVacuumScene operation with the compact map, never the full scene', () => {
    const view = operationView('getVacuumScene', SCENE);
    expect(view).toStrictEqual(compactVacuumMap(SCENE));
    const text = JSON.stringify(view);
    expect(text).not.toContain('rings');
    expect(text).not.toContain('trail');
  });

  it('refuses a scene reply of another shape and leaves other operations as they are', () => {
    expect(() => operationView('getVacuumScene', { index: 1 })).toThrow();
    const cleans = { cleans: [LAST_CLEAN] };
    expect(operationView('listVacuumCleans', cleans)).toBe(cleans);
  });
});
