import type { Store } from '../store/store';

export function ownerProfileOf(store: Pick<Store, 'live'>): string {
  return store.live.access.homeOwner();
}
