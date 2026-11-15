import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { collectionRoleOf } from '../sharing/visibility';

export type FeedAccessStore = Pick<Store, 'plannerCollections' | 'plannerShares'>;

export type FeedAccessNeed = 'view' | 'edit';

export function collectionOf(
  store: FeedAccessStore,
  profileId: string,
  collectionId: string,
  need: FeedAccessNeed,
): PlannerCollectionRow {
  const collection = store.plannerCollections.anyById(collectionId);
  const role = collectionRoleOf(store, profileId, collection);
  if (role === undefined) {
    throw new ApiError('not_found', 'That calendar or list does not exist.');
  }
  if (need === 'edit' && role === 'view') {
    throw new ApiError('forbidden', 'That calendar or list is shared with you to view only.');
  }
  return collection;
}
