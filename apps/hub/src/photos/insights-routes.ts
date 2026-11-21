import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';

const E = PHOTOS_ENDPOINTS;

export interface PhotoInsightRoutes {
  readonly readPhotoInsights: Bound<typeof E.readPhotoInsights>;
  readonly readPhotoRailCounts: Bound<typeof E.readPhotoRailCounts>;
  readonly listPhotoLargestVideos: Bound<typeof E.listPhotoLargestVideos>;
  readonly listPhotoBusiestDays: Bound<typeof E.listPhotoBusiestDays>;
}

export function photoInsightRoutes(store: Store): PhotoInsightRoutes {
  return {
    readPhotoInsights: bound(E.readPhotoInsights, ({ query, caller }) =>
      store.host.read('photoInsights', { actor: photoActor(caller), range: query.range }),
    ),
    listPhotoLargestVideos: bound(E.listPhotoLargestVideos, ({ query, caller }) =>
      store.host.read('photoLargestVideos', {
        actor: photoActor(caller),
        range: query.range,
        cursor: query.cursor,
      }),
    ),
    listPhotoBusiestDays: bound(E.listPhotoBusiestDays, ({ query, caller }) =>
      store.host.read('photoBusiestDays', {
        actor: photoActor(caller),
        range: query.range,
        cursor: query.cursor,
      }),
    ),
    readPhotoRailCounts: bound(E.readPhotoRailCounts, ({ caller }) =>
      store.host.read('photoRailCounts', { actor: photoActor(caller) }),
    ),
  };
}
