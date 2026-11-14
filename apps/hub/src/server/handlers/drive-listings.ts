import { ApiError, type DriveConflict } from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE, type DriveReadService } from '../../drive/service-read';
import type { DuplicatesService } from '../../photos/duplicates';
import type { Store } from '../../store/store';
import type { DriveDuplicateGroup, DriveListings, DrivePage } from './drive-services';

type ListingStore = Pick<Store, 'driveShares' | 'driveConflicts'>;

function pageOf<T extends { readonly id: string }>(rows: readonly T[]): DrivePage<T> {
  const items = rows.slice(0, DRIVE_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    next: rows.length > DRIVE_PAGE_SIZE && last !== undefined ? last.id : null,
  };
}

function unknownCursor(): ApiError {
  return new ApiError('invalid_request', 'The cursor is not one this list gave out.');
}

function shareAfter(
  store: ListingStore,
  actor: DriveActor,
  cursor: string | undefined,
): { readonly at: string; readonly id: string } | null {
  if (cursor === undefined) return null;
  const share = store.driveShares.find(cursor);
  if (share?.createdBy !== actor.profileId) throw unknownCursor();
  return { at: store.driveShares.createdAt(cursor), id: cursor };
}

function conflictAfter(
  store: ListingStore,
  rootIds: readonly string[],
  cursor: string | undefined,
): { readonly at: string; readonly id: string } | null {
  if (cursor === undefined) return null;
  const conflict = store.driveConflicts.find(cursor);
  if (conflict === undefined || !rootIds.includes(conflict.rootId)) throw unknownCursor();
  return { at: conflict.at, id: conflict.id };
}

function visibleRootIds(
  read: DriveReadService,
  actor: DriveActor,
  rootId: string | undefined,
): readonly string[] {
  return rootId === undefined
    ? read.listRoots(actor).map((root) => root.id)
    : [read.rootFor(actor, rootId).id];
}

export interface ListingSources {
  readonly store: ListingStore;
  readonly read: DriveReadService;
  readonly duplicates: Pick<DuplicatesService, 'groups'>;
}

export function driveListings(sources: ListingSources): DriveListings {
  const { store, read, duplicates } = sources;
  return {
    shares: (actor, query) =>
      pageOf(
        store.driveShares.madeBy({
          createdBy: actor.profileId,
          itemId: query.itemId,
          after: shareAfter(store, actor, query.cursor),
          limit: DRIVE_PAGE_SIZE + 1,
        }),
      ),
    conflicts: (actor, query): DrivePage<DriveConflict> => {
      const rootIds = visibleRootIds(read, actor, query.rootId);
      return pageOf(
        store.driveConflicts.page({
          rootIds,
          after: conflictAfter(store, rootIds, query.cursor),
          limit: DRIVE_PAGE_SIZE + 1,
        }),
      );
    },
    duplicates: (actor, query): DrivePage<DriveDuplicateGroup> => {
      if (query.rootId !== undefined) read.rootFor(actor, query.rootId);
      const page = duplicates.groups(actor, { media: false, rootId: query.rootId }, query.cursor);
      return {
        items: page.groups.map(({ sha256, bytes, items }) => ({ sha256, bytes, items })),
        next: page.next,
      };
    },
  };
}
