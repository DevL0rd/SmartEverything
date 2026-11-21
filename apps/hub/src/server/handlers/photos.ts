import { PHOTOS_ENDPOINTS as E } from '@smarteverything/domain';
import { photoActor } from '../../photos/actor';
import type { Store } from '../../store/store';
import { bound, type Bound } from '../router';

type PhotoRouteName = 'listTrips';

export type PhotoRoutes = { readonly [N in PhotoRouteName]: Bound<(typeof E)[N]> };

export function photosRoutes(store: Store): PhotoRoutes {
  return {
    listTrips: bound(E.listTrips, ({ caller }) =>
      store.host.read('photoTrips', {
        actor: photoActor(caller),
        range: { fromDay: null, toDay: null },
      }),
    ),
  };
}
