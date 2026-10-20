import {
  type DeviceCapability,
  type DeviceRow,
  type JsonValue,
  type RoomRow,
} from '@smarteverything/domain';
import type { DeviceUpsert } from '../../../src/database/port';
import { createWorldReads } from '../../../src/automations/world-v3/world-reads';
import type { WorldReadDeps } from '../../../src/automations/world-v3/deps';
import type { PresenceReading } from '../../../src/automations/world-v3/presence';
import type { PersistentVariable } from '../../../src/automations/world-v3/variables';
import { transientNodeMemory } from '../../../src/automations/world-v3/node-memory';
import { seededRandom } from '../../../src/automations/world-v3/random';
import type {
  ReadInputs,
  ReadResult,
  ReadScope,
} from '../../../src/automations/world-v3/read-port';
import type { Store } from '../../../src/store/store';
import { testStore, type TestStore } from '../../support/store';

export const NOW = '2026-10-18T12:00:00.000Z';

export const SCOPE: ReadScope = {
  automationId: '9d1f0c52-6a1e-4f3b-8c47-2a5e7b9d3c10',
  nodeId: 'pick',
  nodeKey: 'pick',
  seed: 7,
  activation: '0',
};

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const BRIGHTNESS: DeviceCapability = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 0, max: 100, step: 1 },
};

const TEMPERATURE: DeviceCapability = {
  key: 'temperature',
  label: 'Temperature',
  access: 'read',
  value: { kind: 'number', min: -40, max: 80, step: 0.1 },
};

const HUMIDITY: DeviceCapability = {
  key: 'humidity',
  label: 'Humidity',
  access: 'read',
  value: { kind: 'number', min: 0, max: 100, step: 1 },
};

const OCCUPANCY: DeviceCapability = {
  key: 'occupancy',
  label: 'Occupancy',
  access: 'read',
  value: { kind: 'boolean' },
};

const BATTERY: DeviceCapability = {
  key: 'battery',
  label: 'Battery',
  access: 'read',
  value: { kind: 'number', min: 0, max: 100, step: 1 },
};

const WRITE_ONLY: DeviceCapability = {
  key: 'child_lock',
  label: 'Child lock',
  access: 'write',
  value: { kind: 'boolean' },
};

interface Intended {
  readonly value: JsonValue;
  readonly completedAt: number;
}

export interface Home {
  readonly test: TestStore;
  readonly kitchen: RoomRow;
  readonly study: RoomRow;
  readonly lampA: DeviceRow;
  readonly lampB: DeviceRow;
  readonly lampC: DeviceRow;
  readonly sensor: DeviceRow;
  readonly motion: DeviceRow;
  readonly intended: Map<string, Intended>;
  readonly people: PresenceReading[];
  readonly persistent: Map<string, PersistentVariable>;
  readonly clock: { current: Date };
  readonly deps: WorldReadDeps;
  readonly read: (kind: string, inputs?: ReadInputs, scope?: Partial<ReadScope>) => ReadResult;
  readonly write: (device: DeviceRow, capability: string, value: JsonValue, at?: string) => void;
}

interface Furnishing {
  readonly externalId: string;
  readonly kind: string;
  readonly name: string;
  readonly roomId: string | null;
  readonly capabilities: readonly DeviceCapability[];
  readonly online?: boolean;
}

function upsert(furnishing: Furnishing): DeviceUpsert {
  return {
    provider: 'local',
    parentId: null,
    model: 'model.one',
    manufacturer: 'Maker',
    providerRoom: null,
    details: {},
    online: true,
    ...furnishing,
  };
}

function stored(rows: readonly DeviceRow[], index: number): DeviceRow {
  const row = rows[index];
  if (row === undefined) throw new Error('the device was not stored');
  return row;
}

interface Fixtures {
  readonly kitchen: RoomRow;
  readonly study: RoomRow;
  readonly devices: readonly DeviceRow[];
}

function furnishRooms(store: Store): Fixtures {
  const kitchen = store.rooms.create('Kitchen', 0);
  const study = store.rooms.create('Study', 1);
  const devices = store.devices.upsert([
    upsert({
      externalId: 'lamp-a',
      kind: 'light',
      name: 'Lamp A',
      roomId: kitchen.id,
      capabilities: [POWER, BRIGHTNESS],
    }),
    upsert({
      externalId: 'lamp-b',
      kind: 'light',
      name: 'Lamp B',
      roomId: kitchen.id,
      capabilities: [POWER, BRIGHTNESS],
    }),
    upsert({
      externalId: 'lamp-c',
      kind: 'light',
      name: 'Lamp C',
      roomId: study.id,
      capabilities: [POWER, WRITE_ONLY],
      online: false,
    }),
    upsert({
      externalId: 'sensor-1',
      kind: 'sensor',
      name: 'Kitchen sensor',
      roomId: kitchen.id,
      capabilities: [TEMPERATURE, HUMIDITY, BATTERY],
    }),
    upsert({
      externalId: 'motion-1',
      kind: 'sensor',
      name: 'Kitchen motion',
      roomId: kitchen.id,
      capabilities: [OCCUPANCY],
    }),
  ]);
  return { kitchen, study, devices };
}

function executorOf(intended: ReadonlyMap<string, Intended>): WorldReadDeps['executor'] {
  return {
    intendedValue: (deviceId, capability, observedAt): JsonValue | undefined => {
      const entry = intended.get(`${deviceId}:${capability}`);
      if (entry === undefined) return undefined;
      const superseded = observedAt !== undefined && Date.parse(observedAt) > entry.completedAt;
      return superseded ? undefined : entry.value;
    },
  };
}

export async function furnish(): Promise<Home> {
  const clock = { current: new Date(NOW) };
  const test = await testStore(() => clock.current);
  const { store } = test;
  const { kitchen, study, devices } = furnishRooms(store);
  const intended = new Map<string, Intended>();
  const people: PresenceReading[] = [];
  const persistent = new Map<string, PersistentVariable>();
  const deps: WorldReadDeps = {
    store,
    executor: executorOf(intended),
    clock: { now: () => clock.current },
    observed: (deviceId, capability) => store.state.value(deviceId, capability),
    presence: { people: () => people },
    persistent: { read: (automationId, name) => persistent.get(`${automationId}:${name}`) },
    random: seededRandom,
    memory: transientNodeMemory(),
    signals: { latest: () => [] },
  };
  const world = createWorldReads(deps);
  return {
    test,
    kitchen,
    study,
    lampA: stored(devices, 0),
    lampB: stored(devices, 1),
    lampC: stored(devices, 2),
    sensor: stored(devices, 3),
    motion: stored(devices, 4),
    intended,
    people,
    persistent,
    clock,
    deps,
    read: (kind, inputs = {}, scope = {}) => world.read(kind, inputs, { ...SCOPE, ...scope }),
    write: (device, capability, value, at = NOW): void => {
      store.state.write([{ deviceId: device.id, capability, value, observedAt: at }]);
    },
  };
}
