import type { Store } from '../store/store';

export function ownerProfileOf(store: Pick<Store, 'personAccess'>): string {
  return store.personAccess.homeOwner();
}
