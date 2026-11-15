import {
  PHOTOS_ENDPOINTS,
  type PhotoFolderHide,
  type PhotoFolders,
  type PhotoHiddenFolders,
} from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';
import { listFolders } from './folder-list';
import { PhotoFolderStore } from './folder-store';

const E = PHOTOS_ENDPOINTS;

export interface PhotoFolderRoutes {
  readonly listPhotoFolders: Bound<typeof E.listPhotoFolders>;
  readonly listHiddenPhotoFolders: Bound<typeof E.listHiddenPhotoFolders>;
  readonly setPhotoFolderHidden: Bound<typeof E.setPhotoFolderHidden>;
}

export class PhotoFolderService {
  private readonly folders: PhotoFolderStore;

  constructor(
    private readonly store: Pick<Store, 'context' | 'feed' | 'write'>,
    private readonly now: () => Date,
  ) {
    this.folders = new PhotoFolderStore(store.context.sql);
  }

  list(actor: DriveActor): PhotoFolders {
    const hidden = new Set(this.folders.hiddenOf(actor.profileId).map((folder) => folder.key));
    return {
      folders: listFolders(this.store.context.sql, actor).map((folder) => ({
        ...folder,
        hidden: hidden.has(folder.key),
      })),
    };
  }

  hidden(actor: DriveActor): PhotoHiddenFolders {
    return { folders: this.folders.hiddenOf(actor.profileId) };
  }

  setHidden(actor: DriveActor, change: PhotoFolderHide): PhotoHiddenFolders {
    this.store.write(() => {
      const changed = this.folders.setHidden({
        profileId: actor.profileId,
        key: change.key,
        name: change.name,
        hidden: change.hidden,
        at: this.now().toISOString(),
      });
      if (changed > 0) {
        this.store.feed.notice({ type: 'photos_folders_changed', profileId: actor.profileId });
      }
    });
    return this.hidden(actor);
  }
}

export function photoFolderRoutes(store: Store, service: PhotoFolderService): PhotoFolderRoutes {
  return {
    listPhotoFolders: bound(E.listPhotoFolders, ({ caller }) =>
      service.list(photoActor(store, caller)),
    ),
    listHiddenPhotoFolders: bound(E.listHiddenPhotoFolders, ({ caller }) =>
      service.hidden(photoActor(store, caller)),
    ),
    setPhotoFolderHidden: bound(E.setPhotoFolderHidden, ({ body, caller }) =>
      service.setHidden(photoActor(store, caller), body),
    ),
  };
}
