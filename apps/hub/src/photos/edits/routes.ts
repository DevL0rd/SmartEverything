import { PHOTOS_EDIT_ENDPOINTS } from '@smarteverything/domain';
import { callerOf } from '../../server/handlers/drive-services';
import { bound, type Bound } from '../../server/router';
import { PhotoEditService } from './service';
import { VideoEditService } from './video';
import type { EditDeps } from './deps';

const E = PHOTOS_EDIT_ENDPOINTS;

export interface PhotoEditRoutes {
  readonly readPhotoEdit: Bound<typeof E.readPhotoEdit>;
  readonly readPhotoEditBase: Bound<typeof E.readPhotoEditBase>;
  readonly readPhotoEditPatch: Bound<typeof E.readPhotoEditPatch>;
  readonly savePhotoEdit: Bound<typeof E.savePhotoEdit>;
  readonly revertPhotoEdit: Bound<typeof E.revertPhotoEdit>;
  readonly erasePhotoArea: Bound<typeof E.erasePhotoArea>;
  readonly editPhotoVideo: Bound<typeof E.editPhotoVideo>;
  readonly readPhotoEditJob: Bound<typeof E.readPhotoEditJob>;
}

export function photoEditRoutes(deps: EditDeps): PhotoEditRoutes {
  const photos = new PhotoEditService(deps);
  const videos = new VideoEditService(deps);
  return {
    readPhotoEdit: bound(E.readPhotoEdit, ({ params, caller }) =>
      photos.read(callerOf(caller), params.itemId),
    ),
    readPhotoEditPatch: bound(E.readPhotoEditPatch, ({ params, caller }) =>
      photos.readPatch(callerOf(caller), params.itemId, params.patchId),
    ),
    readPhotoEditBase: bound(E.readPhotoEditBase, ({ params, caller }) =>
      photos.readBase(callerOf(caller), params.itemId),
    ),
    savePhotoEdit: bound(E.savePhotoEdit, ({ params, body, caller }) =>
      photos.save(callerOf(caller), params.itemId, body),
    ),
    revertPhotoEdit: bound(E.revertPhotoEdit, ({ params, caller }) =>
      photos.revert(callerOf(caller), params.itemId),
    ),
    erasePhotoArea: bound(E.erasePhotoArea, ({ params, body, caller }) =>
      photos.erase(callerOf(caller), params.itemId, body),
    ),
    editPhotoVideo: bound(E.editPhotoVideo, ({ params, body, caller }) =>
      videos.start(callerOf(caller), params.itemId, body),
    ),
    readPhotoEditJob: bound(E.readPhotoEditJob, ({ params, caller }) =>
      videos.read(callerOf(caller), params.jobId),
    ),
  };
}
