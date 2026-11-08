import {
  DEVICE_FAMILIES,
  DEVICE_KINDS,
  deviceFamily,
  presentDevice,
  type DeviceRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadResult,
  type ReadScope,
} from './read-port';
import { GROUP_REF, ROOM_REF, deviceRefs } from './refs';
import { devicesOf } from './targets';
import type { WorldReadDeps } from './deps';
import type { Store } from '../../store/store';

const DEVICE_QUERY = z.object({
  room: ROOM_REF.optional(),
  rooms: z.array(ROOM_REF).optional(),
  group: GROUP_REF.optional(),
  families: z.array(z.enum(DEVICE_FAMILIES)).optional(),
  kinds: z.array(z.enum(DEVICE_KINDS)).optional(),
  capability: z.string().min(1).optional(),
  roles: z.array(z.string().min(1)).optional(),
  labels: z.array(z.string().min(1)).optional(),
  availableOnly: z.boolean().optional(),
});

type Query = z.output<typeof DEVICE_QUERY>;

function roomIdsOf(query: Query): readonly string[] {
  const ids = [...(query.room === undefined ? [] : [query.room]), ...(query.rooms ?? [])];
  return [...new Set(ids)];
}

function inRooms(store: Store, query: Query): readonly DeviceRow[] | undefined {
  const roomIds = roomIdsOf(query);
  if (roomIds.length === 0) return undefined;
  const found = new Map<string, DeviceRow>();
  for (const roomId of roomIds) {
    for (const device of devicesOf(store, { kind: 'room', roomId })) found.set(device.id, device);
  }
  return [...found.values()];
}

function scoped(deps: WorldReadDeps, query: Query): readonly DeviceRow[] {
  const { store } = deps;
  const inRoom = inRooms(store, query);
  const inGroup =
    query.group === undefined
      ? undefined
      : devicesOf(store, { kind: 'group', groupId: query.group });
  if (inRoom !== undefined && inGroup !== undefined) {
    const members = new Set(inGroup.map((device) => device.id));
    return inRoom.filter((device) => members.has(device.id));
  }
  return inRoom ?? inGroup ?? store.devices.list().filter((device) => !device.hidden);
}

function hasRole(device: DeviceRow, roles: readonly string[] | undefined): boolean {
  if (roles === undefined || roles.length === 0) return true;
  return presentDevice(device).capabilities.some(
    (presented) => presented.role !== null && roles.includes(presented.role),
  );
}

function hasCapability(device: DeviceRow, reference: string | undefined): boolean {
  if (reference === undefined) return true;
  return presentDevice(device).capabilities.some(
    (presented) => presented.key === reference || presented.role === reference,
  );
}

function oneOf<T>(wanted: readonly T[] | undefined, actual: T): boolean {
  return wanted === undefined || wanted.length === 0 || wanted.includes(actual);
}

function admitted(query: Query, scope: ReadScope): (device: DeviceRow) => boolean {
  const { families, kinds, capability, roles, availableOnly } = query;
  return (device) =>
    oneOf(families, deviceFamily(device)) &&
    oneOf(kinds, device.kind) &&
    hasCapability(device, capability) &&
    hasRole(device, roles) &&
    (availableOnly !== true || device.online) &&
    (scope.deviceTest === undefined || scope.deviceTest(device.id));
}

export function queryHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.query': (inputs, scope): ReadResult => {
      const query = parseInputs('device.query', DEVICE_QUERY, inputs);
      if (query.labels !== undefined && query.labels.length > 0) {
        throw new ReadFailure('Invalid', 'Devices carry no labels, so none can be matched');
      }
      const devices = scoped(deps, query).filter(admitted(query, scope));
      return outputsOf({
        devices: deviceRefs(devices.map((device) => device.id)),
        count: devices.length,
      });
    },
  };
}
