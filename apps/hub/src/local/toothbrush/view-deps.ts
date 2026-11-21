import {
  ApiError,
  type DeviceRow,
  type MetricSeries,
  type WatchBridge,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { Viewer } from './access';
import type { HomeClock } from './clock';
import type { Fleet } from './fleet';

export interface ViewDeps {
  readonly store: Pick<Store, 'host'>;
  readonly fleet: Fleet;
  readonly clock: HomeClock;
  readonly holder: (device: DeviceRow) => WatchBridge | null;
  readonly series: (deviceId: string, capability: string) => MetricSeries;
  readonly now: () => Date;
}

export function ownerOnly(viewer: Viewer, what: string): void {
  if (viewer.role !== 'owner') {
    throw new ApiError('forbidden', `Only the owner may ${what}.`);
  }
}

export async function nameOf(
  deps: Pick<ViewDeps, 'store'>,
  personId: string | null,
): Promise<string | null> {
  return personId === null ? null : (await deps.store.host.call('profiles', 'byId', personId)).name;
}
