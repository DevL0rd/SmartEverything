import {
  DeviceTargetError,
  targetDevices,
  type DeviceRow,
  type DeviceTarget,
} from '@smarteverything/domain';
import { StoreNotFoundError } from '../../store/context';
import { ReadFailure } from './read-port';
import type { WorldSource } from './world-mirror';

export type TargetWorld = Pick<WorldSource, 'devices' | 'rooms' | 'deviceGroups'>;

export function notFound<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof StoreNotFoundError || cause instanceof DeviceTargetError) {
      throw new ReadFailure('NotFound', cause.message);
    }
    throw cause;
  }
}

function resolved(world: TargetWorld, target: DeviceTarget): readonly DeviceRow[] {
  if (target.kind === 'room') world.rooms.byId(target.roomId);
  if (target.kind === 'group') world.deviceGroups.byId(target.groupId);
  if (target.kind === 'devices')
    target.deviceIds.forEach((id) => {
      world.devices.byId(id);
    });
  return targetDevices(world.devices.list(), world.deviceGroups.list(), target);
}

export function devicesOf(world: TargetWorld, target: DeviceTarget): readonly DeviceRow[] {
  return notFound(() => resolved(world, target));
}

export function deviceById(world: Pick<WorldSource, 'devices'>, id: string): DeviceRow {
  return notFound(() => world.devices.byId(id));
}
