import { DeviceValueIndex } from './device-values';
import type { DeviceCapability, DeviceKind, DeviceRow, RoomRow } from '@smarteverything/domain';
import {
  deviceOf,
  emptyState,
  makeTable,
  type Device,
  type DeviceValues,
  type StoreState,
} from './state';

const STAMP = '2026-10-16T08:00:00.000Z';

const BOOLEAN = { kind: 'boolean' } as const;

function capability(
  key: DeviceCapability['key'],
  access: 'read' | 'read_write',
  unit?: string,
): DeviceCapability {
  const value =
    unit === undefined ? BOOLEAN : { kind: 'number' as const, min: 0, max: 5000, step: 1, unit };
  return { key, label: key, access, value };
}

const KINDS: readonly {
  readonly kind: DeviceKind;
  readonly capabilities: readonly DeviceCapability[];
}[] = [
  {
    kind: 'plug',
    capabilities: [capability('power', 'read_write'), capability('power_draw', 'read', 'W')],
  },
  { kind: 'light', capabilities: [capability('power', 'read_write')] },
  { kind: 'sensor', capabilities: [capability('contact', 'read')] },
  { kind: 'sensor', capabilities: [capability('temperature', 'read', 'C')] },
  { kind: 'lock', capabilities: [capability('lock', 'read_write')] },
];

const FALLBACK = {
  kind: 'plug',
  capabilities: [capability('power', 'read_write')],
} as const;

const ROOM_COUNT = 10;

export function deviceFixture(index: number, overrides: Partial<DeviceRow> = {}): Device {
  const spec = KINDS[index % KINDS.length] ?? FALLBACK;
  return deviceOf({
    id: `dev-${String(index)}`,
    provider: 'xiaomi',
    external_id: `dev-${String(index)}`,
    parent_id: null,
    kind: spec.kind,
    name: `Device ${String(index)}`,
    display_name: null,
    model: 'test.model',
    manufacturer: 'Test',
    provider_room: null,
    room_id: `room-${String(index % ROOM_COUNT)}`,
    online: true,
    capabilities: [...spec.capabilities],
    details: {},
    hidden: false,
    favourite: false,
    position: index,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  });
}

export function valuesFixture(index: number, tick: number): DeviceValues {
  const first = KINDS[index % KINDS.length]?.capabilities[0]?.key ?? 'power';
  const entries: Record<string, { value: number | boolean; observedAt: string }> = {
    [first]: {
      value: first === 'temperature' ? 18 + (tick % 10) : tick % 2 === 0,
      observedAt: STAMP,
    },
  };
  if (index % KINDS.length === 0) {
    entries['power_draw'] = { value: 50 + ((index + tick) % 400), observedAt: STAMP };
  }
  return entries;
}

export function stateFixture(
  devices: readonly Device[],
  values: Readonly<Record<string, DeviceValues>>,
): StoreState {
  const base = emptyState();
  return {
    ...base,
    tables: {
      ...base.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((device) => [device.id, device])),
        devices.map((device) => device.id),
        1,
      ),
      rooms: makeTable(
        Object.fromEntries(
          Array.from({ length: ROOM_COUNT }, (_, room) => [`room-${String(room)}`, roomRow(room)]),
        ),
        Array.from({ length: ROOM_COUNT }, (_, room) => `room-${String(room)}`),
        1,
      ),
    },
    deviceValues: DeviceValueIndex.from(Object.entries(values)),
  };
}

function roomRow(index: number): RoomRow {
  return { id: `room-${String(index)}`, name: `Room ${String(index)}`, position: index };
}
