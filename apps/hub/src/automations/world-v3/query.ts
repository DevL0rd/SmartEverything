import {
  DEVICE_FAMILIES,
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

const DEVICE_QUERY = z.object({
  room: ROOM_REF.optional(),
  group: GROUP_REF.optional(),
  families: z.array(z.enum(DEVICE_FAMILIES)).optional(),
  roles: z.array(z.string().min(1)).optional(),
  labels: z.array(z.string().min(1)).optional(),
  availableOnly: z.boolean().optional(),
});

type Query = z.output<typeof DEVICE_QUERY>;

function scoped(deps: WorldReadDeps, query: Query): readonly DeviceRow[] {
  const { store } = deps;
  const inRoom =
    query.room === undefined ? undefined : devicesOf(store, { kind: 'room', roomId: query.room });
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

function hasRole(device: DeviceRow, roles: readonly string[]): boolean {
  return presentDevice(device).capabilities.some(
    (presented) => presented.role !== null && roles.includes(presented.role),
  );
}

function admitted(query: Query, scope: ReadScope): (device: DeviceRow) => boolean {
  const { families, roles, availableOnly } = query;
  return (device) =>
    (families === undefined || families.length === 0 || families.includes(deviceFamily(device))) &&
    (roles === undefined || roles.length === 0 || hasRole(device, roles)) &&
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
