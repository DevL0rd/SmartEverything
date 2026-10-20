import {
  deviceFamily,
  presentDevice,
  withRole,
  type CapabilityRole,
  type DeviceRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { controlValue } from './device-reads';
import { parseInputs } from './inputs';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { GROUP_REF, ROOM_REF, deviceRefs } from './refs';
import { devicesOf } from './targets';
import type { WorldReadDeps } from './deps';

const ROOM_INFO = z.object({ room: ROOM_REF });

const GROUP_MEMBERS = z.object({ group: GROUP_REF });

function roleKey(device: DeviceRow, role: CapabilityRole): string | undefined {
  return withRole(presentDevice(device), role)?.key;
}

function numbers(
  deps: WorldReadDeps,
  devices: readonly DeviceRow[],
  role: CapabilityRole,
): readonly number[] {
  return devices.flatMap((device) => {
    const key = roleKey(device, role);
    if (key === undefined) return [];
    const value = controlValue(deps, device, key);
    return typeof value === 'number' ? [value] : [];
  });
}

function averageOf(values: readonly number[]): number | undefined {
  return values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function occupancy(deps: WorldReadDeps, devices: readonly DeviceRow[]): boolean | undefined {
  const flags = devices.flatMap((device) => {
    const key = roleKey(device, 'occupancy');
    const value = key === undefined ? undefined : controlValue(deps, device, key);
    return typeof value === 'boolean' ? [value] : [];
  });
  return flags.length === 0 ? undefined : flags.includes(true);
}

function lightsOn(deps: WorldReadDeps, devices: readonly DeviceRow[]): number {
  return devices
    .filter((device) => deviceFamily(device) === 'light')
    .filter((device) => {
      const key = roleKey(device, 'power');
      return key !== undefined && controlValue(deps, device, key) === true;
    }).length;
}

export function roomsGroupsHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'room.info': (inputs): ReadResult => {
      const { room } = parseInputs('room.info', ROOM_INFO, inputs);
      const devices = devicesOf(deps.store, { kind: 'room', roomId: room });
      return outputsOf({
        devices: deviceRefs(devices.map((device) => device.id)),
        occupied: occupancy(deps, devices),
        temperature: averageOf(numbers(deps, devices, 'temperature')),
        humidity: averageOf(numbers(deps, devices, 'humidity')),
        lightsOn: lightsOn(deps, devices),
      });
    },
    'group.members': (inputs): ReadResult => {
      const { group } = parseInputs('group.members', GROUP_MEMBERS, inputs);
      const devices = devicesOf(deps.store, { kind: 'group', groupId: group });
      return outputsOf({ devices: deviceRefs(devices.map((device) => device.id)) });
    },
  };
}
