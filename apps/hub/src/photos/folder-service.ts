import type { PhotoFolderHide, PhotoFolders, PhotoHiddenFolders } from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { listFolders } from './folder-list';
import { PhotoFolderStore } from './folder-store';

export class PhotoFolderService {
  private readonly folders: PhotoFolderStore;

  constructor(
    private readonly store: Pick<HostStore, 'context' | 'feed' | 'write'>,
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

export const PHOTO_FOLDERS_UNIT = storeUnit((store, input: { readonly actor: DriveActor }) =>
  new PhotoFolderService(store, () => store.now()).list(input.actor),
);

export const PHOTO_HIDDEN_FOLDERS_UNIT = storeUnit((store, input: { readonly actor: DriveActor }) =>
  new PhotoFolderService(store, () => store.now()).hidden(input.actor),
);

export const PHOTO_FOLDER_HIDDEN_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly change: PhotoFolderHide }) =>
    new PhotoFolderService(store, () => store.now()).setHidden(input.actor, input.change),
);
