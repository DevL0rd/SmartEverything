import { ApiError, type PhotoDescriptionSet } from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import type { HostStore } from '../../store/host/host-store';
import { announceItems, visibleItems, type AnnounceStore, type ItemsChanged } from './items';

export type DescriptionStore = AnnounceStore &
  Pick<HostStore, 'context' | 'write' | 'photoDescriptions'>;

export class DescriptionEditor {
  constructor(private readonly store: DescriptionStore) {}

  set(actor: DriveActor, itemId: string, change: PhotoDescriptionSet): ItemsChanged {
    return this.store.write(() => {
      const items = visibleItems(this.store.context, actor, [itemId]);
      if (items.some((item) => !item.own)) {
        throw new ApiError(
          'forbidden',
          'Only photos in your own drive or the shared drive can change their description.',
        );
      }
      this.store.photoDescriptions.setManual({
        itemId,
        text: change.text,
        setBy: actor.profileId,
      });
      announceItems(this.store, items);
      return { count: items.length };
    });
  }
}
