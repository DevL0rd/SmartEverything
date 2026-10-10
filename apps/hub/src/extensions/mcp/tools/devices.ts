import {
  DEVICE_FAMILIES,
  DEVICE_KINDS,
  presentDevice,
  presentValue,
  type JsonValue,
  type PresentedCapability,
  type StateRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { READS, defineTool, type Tool } from './registry';
import { inRooms, placedDevice, placedDevices, findCapability, type Placed } from './targets';

const DEVICE_FILTER = z.strictObject({
  rooms: z.array(z.string().min(1)).min(1).optional().describe('Room ids or names'),
  families: z.array(z.enum(DEVICE_FAMILIES)).min(1).optional().describe('Device families'),
  kinds: z.array(z.enum(DEVICE_KINDS)).min(1).optional().describe('Provider device kinds'),
  capability: z
    .string()
    .min(1)
    .optional()
    .describe('Only devices with this capability key, role or label'),
  search: z.string().min(1).max(100).optional().describe('Words in the name, model or room'),
  includeHidden: z.boolean().default(false).describe('Also list devices hidden in the app'),
  limit: z.number().int().min(1).max(500).default(200),
  detail: z
    .boolean()
    .default(false)
    .describe('Give each device in full, as get_device does, when at most 5 match'),
});

const DETAIL_MAX = 5;

type DeviceFind = z.infer<typeof DEVICE_FILTER>;

type DeviceFilter = Omit<DeviceFind, 'detail'>;

export function deviceSummary({ name, device, room, family }: Placed): Record<string, unknown> {
  return {
    id: device.id,
    name,
    family,
    kind: device.kind,
    provider: device.provider,
    model: device.model,
    manufacturer: device.manufacturer,
    online: device.online,
    room_id: device.room_id,
    room: room === null ? null : room.name,
    favourite: device.favourite,
    hidden: device.hidden,
    capabilities: device.capabilities.map((capability) => capability.key),
  };
}

function placedAsAsked(filter: DeviceFilter, { device, room, family }: Placed): boolean {
  return (
    (filter.rooms === undefined || inRooms(room, filter.rooms)) &&
    (filter.families === undefined || filter.families.includes(family)) &&
    (filter.kinds === undefined || filter.kinds.includes(device.kind))
  );
}

function wanted(filter: DeviceFilter, placed: Placed): boolean {
  return (
    placedAsAsked(filter, placed) &&
    (filter.capability === undefined ||
      findCapability(placed.device, filter.capability) !== undefined) &&
    (filter.search === undefined || deviceMatches(filter.search, placed)) &&
    (filter.includeHidden || !placed.device.hidden)
  );
}

function deviceMatches(search: string, { name, device, room, family }: Placed): boolean {
  const wantedWords = search.toLowerCase();
  return [
    name,
    device.name,
    device.display_name,
    device.model,
    device.kind,
    family,
    room?.name ?? null,
  ].some((field) => field?.toLowerCase().includes(wantedWords) === true);
}

export function listedDevices(store: Store, filter: DeviceFilter): Record<string, unknown>[] {
  return placedDevices(store)
    .filter((placed) => wanted(filter, placed))
    .slice(0, filter.limit)
    .map(deviceSummary);
}

function foundDevices(store: Store, filter: DeviceFind): Record<string, unknown>[] {
  const found = listedDevices(store, filter);
  if (!filter.detail || found.length > DETAIL_MAX) {
    return found;
  }
  return found.map((summary) => deviceDetails(store, String(summary['id'])));
}

function described(
  presented: PresentedCapability,
  state: StateRow | undefined,
): Record<string, unknown> {
  const value: JsonValue | undefined = state?.value;
  return {
    key: presented.key,
    label: presented.label,
    role: presented.role,
    group: presented.groupLabel,
    tier: presented.tier,
    access: presented.capability.access,
    writable: presented.writable,
    value_type: presented.capability.value,
    options: presented.options,
    unit: presented.unit,
    value: value ?? null,
    shown_as: value === undefined ? null : presentValue(presented, value),
    observed_at: state?.observed_at ?? null,
  };
}

function deviceDetails(store: Store, deviceId: string): Record<string, unknown> {
  const placed = placedDevice(store, deviceId);
  const states = new Map(
    store.state
      .list()
      .filter((row) => row.device_id === deviceId)
      .map((row) => [row.capability, row]),
  );
  const camera = store.cameras.list().find((row) => row.device_id === deviceId);
  return {
    device: {
      ...deviceSummary(placed),
      details: placed.device.details,
      updated_at: placed.device.updated_at,
      camera: camera ?? null,
    },
    capabilities: presentDevice(placed.device).capabilities.map((presented) =>
      described(presented, states.get(presented.key)),
    ),
  };
}

export const DEVICE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_devices',
    input: DEVICE_FILTER,
    annotations: READS,
    run: ({ store }, input) => ({ structured: { devices: foundDevices(store, input) } }),
  }),
  defineTool({
    name: 'get_device',
    input: z.strictObject({ deviceId: z.uuid() }),
    annotations: READS,
    run: ({ store }, input) => ({ structured: deviceDetails(store, input.deviceId) }),
  }),
];
