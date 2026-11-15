import {
  ApiError,
  type PlannerBookingPageRow,
  type PlannerCollectionRow,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';

export type BookingPageStore = Pick<Store, 'plannerBookingPages' | 'plannerCollections'>;

export function requireBookable(
  store: BookingPageStore,
  profileId: string,
  collectionId: string,
): PlannerCollectionRow {
  const collection = store.plannerCollections.byId(collectionId, profileId);
  if (collection.kind !== 'calendar' || collection.source === 'feed') {
    throw new ApiError(
      'invalid_request',
      'Bookings go into one of your own calendars, not a list or a subscription.',
    );
  }
  return collection;
}

export function pageOf(
  store: BookingPageStore,
  profileId: string,
  pageId: string,
): PlannerBookingPageRow {
  return store.plannerBookingPages.byId(pageId, profileId);
}
