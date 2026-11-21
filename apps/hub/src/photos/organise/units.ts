import type { LibraryScope, PhotoDescriptionSet, PhotoItemIds } from '@smarteverything/domain';
import { homeZone } from '../../automations/world-v3/zone';
import type { DriveActor } from '../../drive/access';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import type { PageQuery } from '../library';
import { ArchiveService } from './archive';
import { DescriptionEditor } from './description';
import { announceItems, visibleItems, type VisibleItem } from './items';
import { OrganisePages } from './pages';

export interface Scoped {
  readonly actor: DriveActor;
  readonly scope: LibraryScope;
}

export interface Paged {
  readonly actor: DriveActor;
  readonly month: string;
  readonly query: PageQuery;
}

export interface Picked {
  readonly actor: DriveActor;
  readonly request: PhotoItemIds;
}

function pagesOf(store: HostStore): OrganisePages {
  return new OrganisePages(store.context, () => homeZone(store));
}

export const PHOTO_ARCHIVE_BUCKETS_UNIT = storeUnit((store, input: Scoped) =>
  pagesOf(store).archiveBuckets(input.actor, input.scope),
);

export const PHOTO_ARCHIVE_PAGE_UNIT = storeUnit((store, input: Paged) =>
  pagesOf(store).archivePage(input.actor, input.month, input.query),
);

export const PHOTO_LOCKED_BUCKETS_UNIT = storeUnit((store, input: Scoped) =>
  pagesOf(store).lockedBuckets(input.actor, input.scope),
);

export const PHOTO_LOCKED_PAGE_UNIT = storeUnit((store, input: Paged) =>
  pagesOf(store).lockedPage(input.actor, input.month, input.query),
);

export const PHOTO_ARCHIVED_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly itemId: string }) =>
    new ArchiveService(store).archived(input.actor, input.itemId),
);

export const PHOTO_ARCHIVE_UNIT = storeUnit((store, input: Picked) =>
  new ArchiveService(store).archive(input.actor, input.request),
);

export const PHOTO_UNARCHIVE_UNIT = storeUnit((store, input: Picked) =>
  new ArchiveService(store).unarchive(input.actor, input.request),
);

export const PHOTO_DESCRIPTION_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly itemId: string;
      readonly change: PhotoDescriptionSet;
    },
  ) => new DescriptionEditor(store).set(input.actor, input.itemId, input.change),
);

export const PHOTO_VISIBLE_ITEMS_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly itemIds: readonly string[] }) =>
    visibleItems(store.context, input.actor, input.itemIds),
);

export const PHOTO_ITEMS_ANNOUNCE_UNIT = storeUnit(
  (store, input: { readonly items: readonly VisibleItem[] }): void => {
    announceItems(store, input.items);
  },
);
