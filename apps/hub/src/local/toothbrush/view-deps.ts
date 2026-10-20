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
  readonly store: Store;
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

export function nameOf(deps: Pick<ViewDeps, 'store'>, personId: string | null): string | null {
  return personId === null ? null : deps.store.profiles.byId(personId).name;
}
