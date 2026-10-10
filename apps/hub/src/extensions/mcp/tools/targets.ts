import {
  DEVICE_FAMILIES,
  deviceFamily,
  displayName,
  presentDevice,
  type DeviceFamily,
  type DeviceRow,
  type PresentedCapability,
  type RoomRow,
} from '@smarteverything/domain';
import { z } from 'zod';
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

export function nameOf(store: Store, device: DeviceRow): string {
  return displayName(device, store.devices.list(), store.rooms.list());
}

function order(left: Placed, right: Placed): number {
  return (
    (left.room?.position ?? Number.MAX_SAFE_INTEGER) -
      (right.room?.position ?? Number.MAX_SAFE_INTEGER) ||
    left.device.position - right.device.position ||
    left.name.localeCompare(right.name)
  );
}

export function placedDevices(store: Store): Placed[] {
  const roomRows = store.rooms.list();
  const devices = store.devices.list();
  const rooms = new Map(roomRows.map((room) => [room.id, room]));
  return devices
    .map((device) => ({
      name: displayName(device, devices, roomRows),
      device,
      room: device.room_id === null ? null : (rooms.get(device.room_id) ?? null),
      family: deviceFamily(device),
    }))
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

export function targeted(store: Store, target: Target): Placed[] {
  const found = placedDevices(store).filter((placed) => selected(target, placed));
  if (found.length === 0) {
    throw new ToolError(
      `No device matches ${JSON.stringify(target)}; list_devices and list_rooms show what exists`,
      'not_found',
    );
  }
  return found;
}

export function placedDevice(store: Store, deviceId: string): Placed {
  const found = placedDevices(store).find((placed) => placed.device.id === deviceId);
  if (found === undefined) {
    throw new ToolError(`There is no device ${deviceId} in your home`, 'not_found');
  }
  return found;
}

function byLabel(
  presented: readonly PresentedCapability[],
  wanted: string,
): PresentedCapability | undefined {
  const exact = presented.find((candidate) => candidate.label.toLowerCase() === wanted);
  if (exact !== undefined) {
    return exact;
  }
  const partial = presented.filter((candidate) => candidate.label.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : undefined;
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
