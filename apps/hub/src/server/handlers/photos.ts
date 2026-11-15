import { PHOTOS_ENDPOINTS as E } from '@smarteverything/domain';
import { homeLocation } from '../../automations/world-v3/zone';
import { photoActor } from '../../photos/actor';
import { TripsReader } from '../../photos/trips';
import type { StoreContext } from '../../store/context';
import type { Store } from '../../store/store';
import { bound, type Bound } from '../router';

export interface PhotoReaders {
  readonly trips: TripsReader;
}

export function photoReaders(context: StoreContext): PhotoReaders {
  return {
    trips: new TripsReader(context),
  };
}

export function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

type PhotoRouteName = 'listTrips';

export type PhotoRoutes = { readonly [N in PhotoRouteName]: Bound<(typeof E)[N]> };

export function photosRoutes(store: Store, readers: PhotoReaders): PhotoRoutes {
  return {
    listTrips: bound(E.listTrips, ({ caller }) =>
      readers.trips.list(photoActor(store, caller), homeLocation(store), {
        fromDay: null,
        toDay: null,
      }),
    ),
  };
}
