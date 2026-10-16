import { z } from 'zod';
import { ID } from './api/primitives';
import { deviceFamily } from './presentation/device-family';
import { DEVICE_FAMILIES } from './presentation/types';
import type { DeviceRow } from './api/rows-home';
import type { DeviceGroupRow } from './device-groups';

export const DEVICE_GROUP_CAPABILITY = 'device-groups-v1';
export const DEVICE_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('room'),
    roomId: ID,
    families: z.array(z.enum(DEVICE_FAMILIES)).min(1).optional(),
  }),
  z.strictObject({ kind: z.literal('group'), groupId: ID }),
  z.strictObject({ kind: z.literal('devices'), deviceIds: z.array(ID).min(1).max(100) }),
]);
export type DeviceTarget = z.infer<typeof DEVICE_TARGET>;

export class DeviceTargetError extends Error {
  override readonly name = 'DeviceTargetError';
  constructor(
    readonly target: DeviceTarget,
    reason: string,
  ) {
    super(reason);
  }
}

export function targetDevices<T extends DeviceRow>(
  devices: readonly T[],
  groups: readonly DeviceGroupRow[],
  target: DeviceTarget,
): readonly T[] {
  switch (target.kind) {
    case 'room':
      return devices.filter(
        (device) =>
          device.room_id === target.roomId &&
          !device.hidden &&
          (target.families === undefined || target.families.includes(deviceFamily(device))),
      );
    case 'devices':
      return devices.filter((device) => target.deviceIds.includes(device.id));
    case 'group': {
      const group = groups.find((candidate) => candidate.id === target.groupId);
      if (group === undefined)
        throw new DeviceTargetError(target, 'This device group no longer exists.');
      return devices.filter((device) => group.device_ids.includes(device.id));
    }
  }
}
