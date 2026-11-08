import { PHOTOS_ENDPOINTS, type PhotoSource } from '@smarteverything/domain';
import { profileIdOf } from '../../server/auth';
import { deviceScopeOf } from '../../server/person-scope';
import { bound, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import type { SourceService } from './shapes';

const E = PHOTOS_ENDPOINTS;

export interface PhotoSourceRoutes {
  readonly listPhotoSource: Bound<typeof E.listPhotoSource>;
  readonly keepSourceItems: Bound<typeof E.keepSourceItems>;
}

export function photoSourceRoutes(
  store: Store,
  services: Readonly<Record<PhotoSource, SourceService>>,
): PhotoSourceRoutes {
  return {
    listPhotoSource: bound(E.listPhotoSource, ({ params, query, caller }) =>
      services[params.source].page(
        { profileId: profileIdOf(store, caller), devices: deviceScopeOf(store, caller) },
        query,
      ),
    ),
    keepSourceItems: bound(E.keepSourceItems, async ({ params, body, caller }) => ({
      kept: await services[params.source].keep(
        { profileId: profileIdOf(store, caller), devices: deviceScopeOf(store, caller) },
        body.itemIds,
      ),
    })),
  };
}
