import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';

export function requireShareable(
  store: Pick<HostStore, 'plannerCollections'>,
  profileId: string,
  collectionId: string,
): PlannerCollectionRow {
  const collection = store.plannerCollections.byId(collectionId, profileId);
  if (collection.audience === 'household') {
    throw new ApiError('invalid_request', 'The Family calendar is already shared with everyone.');
  }
  return collection;
}

export function requireSharee(
  store: Pick<HostStore, 'profiles' | 'personAccess'>,
  collection: PlannerCollectionRow,
  personId: string,
): void {
  if (personId === collection.profile_id) {
    throw new ApiError('invalid_request', 'You cannot share a calendar with its owner.');
  }
  const person = store.profiles.byId(personId);
  const areas = store.personAccess.scopes(person.id)?.areas ?? [];
  if (!areas.includes('planner')) {
    throw new ApiError('invalid_request', `${person.name} has no access to the Planner.`);
  }
}
