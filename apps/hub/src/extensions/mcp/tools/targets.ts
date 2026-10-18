import {
  DEVICE_FAMILIES,
  deviceFamily,
  baseNameOf,
  presentDevice,
  type DeviceFamily,
  type DeviceRow,
  type DeviceScope,
  type PresentedCapability,
  type RoomRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { deviceHidden } from '../../../server/person-scope';
import type { Store } from '../../../store/store';
import { ToolError, matches } from './registry';

export interface Placed {
  readonly name: string;
  readonly device: DeviceRow;
  readonly room: RoomRow | null;
  readonly family: DeviceFamily;
}

export const TARGET = z
  .strictObject({
    deviceIds: z.array(z.uuid()).min(1).max(100).optional().describe('These devices'),
    rooms: z
      .array(z.string().min(1).max(80))
      .min(1)
      .optional()
      .describe('Devices in these rooms, by room id or name'),
    families: z
      .array(z.enum(DEVICE_FAMILIES))
      .min(1)
      .optional()
      .describe('Device families, such as air_conditioner, light or camera'),
    search: z.string().min(1).max(100).optional().describe('Words in the name, model or room'),
  })
  .refine((target) => Object.values(target).some((value) => value !== undefined), {
    message: 'name devices by deviceIds, rooms, families or search',
  })
  .describe('Which devices; every filter given must match');

export type Target = z.infer<typeof TARGET>;

export function deviceNames(store: Store): ReadonlyMap<string, string> {
  return new Map(store.devices.list().map((device) => [device.id, baseNameOf(device)] as const));
}

function order(left: Placed, right: Placed): number {
  return (
    (left.room?.position ?? Number.MAX_SAFE_INTEGER) -
      (right.room?.position ?? Number.MAX_SAFE_INTEGER) ||
    left.device.position - right.device.position ||
    left.name.localeCompare(right.name)
  );
}

function placedOf(device: DeviceRow, name: string, rooms: ReadonlyMap<string, RoomRow>): Placed {
  return {
    name,
    device,
    room: device.room_id === null ? null : (rooms.get(device.room_id) ?? null),
    family: deviceFamily(device),
  };
}

function roomsById(roomRows: readonly RoomRow[]): ReadonlyMap<string, RoomRow> {
  return new Map(roomRows.map((room) => [room.id, room]));
}

export function placedDevices(store: Store, scope: DeviceScope | null): Placed[] {
  const roomRows = store.rooms.list();
  const rooms = roomsById(roomRows);
  return store.devices
    .list()
    .filter((device) => !deviceHidden(scope, device))
    .map((device) => placedOf(device, baseNameOf(device), rooms))
    .sort(order);
}

export function inRooms(room: RoomRow | null, rooms: readonly string[]): boolean {
  return (
    room !== null &&
    rooms.some((wanted) => wanted === room.id || wanted.toLowerCase() === room.name.toLowerCase())
  );
}

function wordsMatch(search: string, { name, device, room }: Placed): boolean {
  return matches(
    search,
    name,
    device.name,
    device.display_name,
    device.model,
    device.manufacturer,
    room === null ? null : room.name,
  );
}

function placedAsAsked(target: Target, placed: Placed): boolean {
  return (
    (target.rooms === undefined || inRooms(placed.room, target.rooms)) &&
    (target.families === undefined || target.families.includes(placed.family))
  );
}

function selected(target: Target, placed: Placed): boolean {
  const named = target.deviceIds;
  return (
    (named === undefined ? !placed.device.hidden : named.includes(placed.device.id)) &&
    placedAsAsked(target, placed) &&
    (target.search === undefined || wordsMatch(target.search, placed))
  );
}

export function targeted(store: Store, scope: DeviceScope | null, target: Target): Placed[] {
  const found = placedDevices(store, scope).filter((placed) => selected(target, placed));
  if (found.length === 0) {
    throw new ToolError(
      `No device matches ${JSON.stringify(target)}; find_devices and get_home show what exists`,
      'not_found',
    );
  }
  return found;
}

export function placedDevice(store: Store, scope: DeviceScope | null, deviceId: string): Placed {
  const device = store.devices.find(deviceId);
  if (device === undefined) {
    throw new ToolError(`There is no device ${deviceId} in your home`, 'not_found');
  }
  if (deviceHidden(scope, device)) {
    throw new ToolError('That device is not part of your access; ask the owner.', 'forbidden');
  }
  const roomRows = store.rooms.list();
  return placedOf(device, baseNameOf(device), roomsById(roomRows));
}

export interface Naming<T> {
  readonly names: (row: T) => readonly (string | null)[];
  readonly label: (row: T) => string;
  readonly id?: (row: T) => string;
}

function candidateOf<T>(naming: Naming<T>, row: T): string {
  const id = naming.id?.(row);
  return id === undefined ? naming.label(row) : `${naming.label(row)} (id ${id})`;
}

export function closestMatches<T>(rows: readonly T[], wanted: string, naming: Naming<T>): T[] {
  const text = wanted.trim().toLowerCase();
  const lowered = (row: T): (string | null)[] =>
    naming.names(row).map((name) => (name === null ? null : name.toLowerCase()));
  const byId = rows.filter((row) => naming.id?.(row).toLowerCase() === text);
  if (byId.length > 0) {
    return byId;
  }
  const width = Math.max(0, ...rows.map((row) => naming.names(row).length));
  for (let position = 0; position < width; position += 1) {
    const exact = rows.filter((row) => lowered(row)[position] === text);
    if (exact.length > 0) {
      return exact;
    }
  }
  return rows.filter((row) => lowered(row).some((name) => name?.includes(text) === true));
}

export function resolveNamed<T>(
  rows: readonly T[],
  wanted: string,
  noun: string,
  naming: Naming<T>,
): T {
  const found = closestMatches(rows, wanted, naming);
  const [first, second] = found;
  if (first === undefined) {
    throw new ToolError(`There is no ${noun} matching "${wanted}"`, 'not_found');
  }
  if (second !== undefined) {
    throw new ToolError(
      `"${wanted}" matches more than one ${noun}: ${found.map((row) => candidateOf(naming, row)).join(', ')}; use the id`,
    );
  }
  return first;
}

function byLabel(
  presented: readonly PresentedCapability[],
  wanted: string,
): PresentedCapability | undefined {
  const found = closestMatches(presented, wanted, {
    names: (candidate) => [candidate.label],
    label: (candidate) => candidate.label,
  });
  const [first] = found;
  return found.length === 1 || first?.label.toLowerCase() === wanted ? first : undefined;
}

export function findCapability(
  device: DeviceRow,
  reference: string,
): PresentedCapability | undefined {
  const presented = presentDevice(device).capabilities;
  const wanted = reference.trim().toLowerCase();
  return (
    presented.find((candidate) => candidate.key === reference) ??
    presented.find((candidate) => candidate.role === reference) ??
    byLabel(presented, wanted)
  );
}

export function capabilityOf({ name, device }: Placed, reference: string): PresentedCapability {
  const found = findCapability(device, reference);
  if (found === undefined) {
    throw new ToolError(
      `${name} has no capability "${reference}" (key, role or label); get_device lists them`,
      'not_found',
    );
  }
  return found;
}
