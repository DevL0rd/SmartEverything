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

export const TARGET_FIELDS = {
  deviceIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(100)
    .optional()
    .describe('These devices, each by name or id (device_find lists both)'),
  group: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Every device of this device group, by name or id (home_read lists groups)'),
  rooms: z
    .array(z.string().min(1).max(80))
    .min(1)
    .optional()
    .describe('Devices in these rooms, by room name or id'),
  families: z
    .array(z.enum(DEVICE_FAMILIES))
    .min(1)
    .optional()
    .describe('Device families, such as air_conditioner, light or camera'),
  search: z.string().min(1).max(100).optional().describe('Words in the name, model or room'),
};

export type Target = z.output<z.ZodObject<typeof TARGET_FIELDS>>;

export function hasTarget(target: Target): boolean {
  return Object.values(target).some((value) => value !== undefined);
}

type HostStore = Pick<Store, 'host'>;

export async function deviceNames(store: HostStore): Promise<ReadonlyMap<string, string>> {
  return new Map(
    (await store.host.call('devices', 'list')).map(
      (device) => [device.id, baseNameOf(device)] as const,
    ),
  );
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

export async function placedDevices(
  store: HostStore,
  scope: DeviceScope | null,
): Promise<Placed[]> {
  const home = await store.host.read('mcpHomeDevices', null);
  return placedFrom(home.rooms, home.devices, scope);
}

export function placedFrom(
  roomRows: readonly RoomRow[],
  devices: readonly DeviceRow[],
  scope: DeviceScope | null,
): Placed[] {
  const rooms = roomsById(roomRows);
  return devices
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

const ID_PATTERN = z.uuid();

const DEVICE_NAMING: NamedLookup<Placed> = {
  lists: 'device_find',
  names: ({ name, device }) => [name, device.name, device.display_name],
  label: ({ name }) => name,
  id: ({ device }) => device.id,
};

async function memberIds(
  store: HostStore,
  target: Target,
  all: readonly Placed[],
): Promise<ReadonlySet<string> | null> {
  const sets: ReadonlySet<string>[] = [];
  if (target.deviceIds !== undefined) {
    sets.push(
      new Set(
        target.deviceIds.map(
          (wanted) => resolveNamed(all, wanted, 'device', DEVICE_NAMING).device.id,
        ),
      ),
    );
  }
  if (target.group !== undefined) {
    const groups = await store.host.call('deviceGroups', 'list');
    const group = resolveNamed(groups, target.group, 'device group', {
      names: (row) => [row.name],
      label: (row) => row.name,
      id: (row) => row.id,
      lists: 'home_read',
    });
    sets.push(new Set(group.device_ids));
  }
  const [first, ...rest] = sets;
  return first === undefined
    ? null
    : new Set([...first].filter((id) => rest.every((set) => set.has(id))));
}

function selected(target: Target, members: ReadonlySet<string> | null, placed: Placed): boolean {
  return (
    (members === null ? !placed.device.hidden : members.has(placed.device.id)) &&
    placedAsAsked(target, placed) &&
    (target.search === undefined || wordsMatch(target.search, placed))
  );
}

function describedTarget(target: Target): string {
  return Object.entries(target)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => `${field} ${JSON.stringify(value)}`)
    .join(', ');
}

export async function targeted(
  store: HostStore,
  scope: DeviceScope | null,
  target: Target,
): Promise<Placed[]> {
  const all = await placedDevices(store, scope);
  const members = await memberIds(store, target, all);
  const found = all.filter((placed) => selected(target, members, placed));
  if (found.length === 0) {
    throw new ToolError(
      `No device matches ${describedTarget(target)}; device_find lists the devices, home_read the rooms and groups`,
      'not_found',
    );
  }
  return found;
}

export async function placedDevice(
  store: HostStore,
  scope: DeviceScope | null,
  reference: string,
): Promise<Placed> {
  const { device, rooms } = await store.host.read('mcpDeviceWithRooms', reference);
  if (device === undefined) {
    if (ID_PATTERN.safeParse(reference).success) {
      throw new ToolError(
        `There is no device ${reference} in your home; device_find lists the devices`,
        'not_found',
      );
    }
    return resolveNamed(await placedDevices(store, scope), reference, 'device', DEVICE_NAMING);
  }
  if (deviceHidden(scope, device)) {
    throw new ToolError('That device is not part of your access; ask the owner.', 'forbidden');
  }
  return placedOf(device, baseNameOf(device), roomsById(rooms));
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

interface NamedLookup<T> extends Naming<T> {
  readonly lists?: string;
}

export function resolveNamed<T>(
  rows: readonly T[],
  wanted: string,
  noun: string,
  naming: NamedLookup<T>,
): T {
  const { lists } = naming;
  const found = closestMatches(rows, wanted, naming);
  const [first, second] = found;
  if (first === undefined) {
    throw new ToolError(
      `There is no ${noun} matching "${wanted}"${lists === undefined ? '' : `; ${lists} lists them`}`,
      'not_found',
    );
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
      `${name} has no capability "${reference}" (key, role or label); device_read lists them`,
      'not_found',
    );
  }
  return found;
}
