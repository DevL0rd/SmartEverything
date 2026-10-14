import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';

export function ownerProfile(store: Store): string {
  const owner = store.clients.owner();
  if (owner === undefined) throw new ApiError('conflict', 'This server has no owner yet.');
  return store.profiles.activeOf(owner.id).id;
}
