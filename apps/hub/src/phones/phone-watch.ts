import type { Store } from '../store/store';
import type { Viewers } from '../metrics/viewers';
import type { ProcessWindow } from '@smarteverything/domain';
import type { WatchNotice, WatchSource } from '../server/live-watch';
import { detailKeyframe, phoneViewerOfClient, tierOfViewer } from './phone-detail';
import type { PhoneNodes } from './phone-nodes';

export function phoneWatchSource(
  store: Pick<Store, 'devices' | 'phoneDetails' | 'profiles'>,
  phones: Pick<PhoneNodes, 'target'>,
  viewers: Pick<Viewers<ProcessWindow>, 'hold' | 'release'>,
): WatchSource {
  return {
    viewers,
    allowed: (client, deviceId): boolean => {
      const device = store.devices.find(deviceId);
      return (
        device?.kind === 'phone' &&
        tierOfViewer(phones.target(device), phoneViewerOfClient(store, client)) !== 'member'
      );
    },
    keyframe: (deviceId, client): WatchNotice | null => {
      const device = store.devices.find(deviceId);
      return device?.kind === 'phone'
        ? detailKeyframe(store, phones.target(device), phoneViewerOfClient(store, client))
        : null;
    },
  };
}
