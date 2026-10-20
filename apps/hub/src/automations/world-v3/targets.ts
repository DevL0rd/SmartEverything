import { DeviceTargetError, type DeviceRow, type DeviceTarget } from '@smarteverything/domain';
import { resolveTarget } from '../../device-groups/commands';
import { StoreNotFoundError } from '../../store/context';
import { ReadFailure } from './read-port';
import type { Store } from '../../store/store';

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

export function devicesOf(store: Store, target: DeviceTarget): readonly DeviceRow[] {
  return notFound(() => resolveTarget(store, target));
}

export function deviceById(store: Store, id: string): DeviceRow {
  return notFound(() => store.devices.byId(id));
}
