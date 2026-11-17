import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { bound, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';
import type { PhotoModelCatalogue } from './catalogue';
import type { PhotoAi } from './service';

const E = PHOTOS_ENDPOINTS;

export interface PhotoAiRoutes {
  readonly readPhotoAiStatus: Bound<typeof E.readPhotoAiStatus>;
  readonly setPhotoAiSettings: Bound<typeof E.setPhotoAiSettings>;
  readonly listPhotoAiModels: Bound<typeof E.listPhotoAiModels>;
  readonly setPhotoAiModels: Bound<typeof E.setPhotoAiModels>;
  readonly reanalysePhotos: Bound<typeof E.reanalysePhotos>;
  readonly retryFailedPhotoAi: Bound<typeof E.retryFailedPhotoAi>;
  readonly readPhotoAnalysis: Bound<typeof E.readPhotoAnalysis>;
}

export function photoAiRoutes(
  store: Store,
  ai: PhotoAi,
  catalogue: PhotoModelCatalogue,
): PhotoAiRoutes {
  return {
    readPhotoAiStatus: bound(E.readPhotoAiStatus, ({ caller }) =>
      ai.statusOf(photoActor(store, caller)),
    ),
    setPhotoAiSettings: bound(E.setPhotoAiSettings, ({ body, caller }) =>
      ai.setSwitches(photoActor(store, caller), body),
    ),
    listPhotoAiModels: bound(E.listPhotoAiModels, () => catalogue.read()),
    setPhotoAiModels: bound(E.setPhotoAiModels, async ({ body }) => {
      await catalogue.require(body);
      return ai.models.update(body);
    }),
    reanalysePhotos: bound(E.reanalysePhotos, ({ body }) => ai.reanalyse(body)),
    retryFailedPhotoAi: bound(E.retryFailedPhotoAi, ({ caller }) =>
      ai.retryFailed(photoActor(store, caller)),
    ),
    readPhotoAnalysis: bound(E.readPhotoAnalysis, ({ params, caller }) =>
      ai.analysisOf(photoActor(store, caller), params.itemId),
    ),
  };
}
