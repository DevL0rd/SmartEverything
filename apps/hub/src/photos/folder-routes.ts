import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';

const E = PHOTOS_ENDPOINTS;

export interface PhotoFolderRoutes {
  readonly listPhotoFolders: Bound<typeof E.listPhotoFolders>;
  readonly listHiddenPhotoFolders: Bound<typeof E.listHiddenPhotoFolders>;
  readonly setPhotoFolderHidden: Bound<typeof E.setPhotoFolderHidden>;
}

export function photoFolderRoutes(store: Store): PhotoFolderRoutes {
  return {
    listPhotoFolders: bound(E.listPhotoFolders, ({ caller }) =>
      store.host.read('photoFolders', { actor: photoActor(caller) }),
    ),
    listHiddenPhotoFolders: bound(E.listHiddenPhotoFolders, ({ caller }) =>
      store.host.read('photoHiddenFolders', { actor: photoActor(caller) }),
    ),
    setPhotoFolderHidden: bound(E.setPhotoFolderHidden, ({ body, caller }) =>
      store.host.write('photoFolderHidden', { actor: photoActor(caller), change: body }),
    ),
  };
}
