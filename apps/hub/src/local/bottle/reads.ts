import type { BottleReadQuery, BottleView, DeviceRow, WatchBridge } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { Viewer } from './access';
import type { HomeClock } from './clock';
import { entryConfigOf } from './config';
import { statsKey, type StatsCache } from './views-stats';

export interface BottleReadDeps {
  readonly store: Pick<Store, 'host'>;
  readonly holder: (device: DeviceRow) => WatchBridge | null;
  readonly syncing: (deviceId: string) => boolean;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly stats: StatsCache;
}

export function readBottle(
  deps: BottleReadDeps,
  target: { readonly device: DeviceRow; readonly entry: LocalDeviceEntry; readonly viewer: Viewer },
  query: BottleReadQuery,
): Promise<BottleView> {
  const { device, entry, viewer } = target;
  const now = deps.now();
  const read = (): Promise<BottleView> =>
    deps.store.host.read('bottleView', {
      device,
      entry,
      viewer,
      query,
      holder: deps.holder(device),
      syncing: deps.syncing(device.id),
      now: now.toISOString(),
    });
  if (query.view !== 'stats') {
    return read();
  }
  const profileId = entryConfigOf(entry).binding.profileId ?? viewer.profileId;
  const key = statsKey(device, profileId, query.range ?? 'week', deps.clock.dayOf(now));
  return deps.stats.get(key, read);
}
