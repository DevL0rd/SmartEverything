import type { PhotoArchived, PhotoItemIds } from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import type { HostStore } from '../../store/host/host-store';
import { announceItems, visibleItems, type AnnounceStore, type ItemsChanged } from './items';

export type ArchiveStore = AnnounceStore & Pick<HostStore, 'context' | 'write' | 'photoArchive'>;

export class ArchiveService {
  constructor(private readonly store: ArchiveStore) {}

  archive(actor: DriveActor, request: PhotoItemIds): ItemsChanged {
    return this.change(actor, request, (ids) =>
      this.store.photoArchive.archive(actor.profileId, ids),
    );
  }

  unarchive(actor: DriveActor, request: PhotoItemIds): ItemsChanged {
    return this.change(actor, request, (ids) =>
      this.store.photoArchive.restore(actor.profileId, ids),
    );
  }

  archived(actor: DriveActor, itemId: string): PhotoArchived {
    visibleItems(this.store.context, actor, [itemId]);
    return {
      archived: this.store.photoArchive.archivedAmong(actor.profileId, [itemId]).length > 0,
    };
  }

  private change(
    actor: DriveActor,
    request: PhotoItemIds,
    apply: (ids: readonly string[]) => number,
  ): ItemsChanged {
    return this.store.write(() => {
      const items = visibleItems(this.store.context, actor, request.itemIds);
      const count = apply(items.map((item) => item.id));
      if (count > 0) announceItems(this.store, items);
      return { count };
    });
  }
}
