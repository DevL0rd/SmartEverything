import { ApiError, type DriveConflict } from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import type { DriveReadService } from '../../drive/service-read';
import { DRIVE_PAGE_SIZE } from '../../drive/page-size';
import type { DuplicatesService } from '../../photos/duplicates';
import type { Store } from '../../store/store';
import type { DriveDuplicateGroup, DriveListings, DrivePage } from './drive-services';

type ListingStore = Pick<Store, 'host'>;

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

async function conflictAfter(
  store: ListingStore,
  rootIds: readonly string[],
  cursor: string | undefined,
): Promise<{ readonly at: string; readonly id: string } | null> {
  if (cursor === undefined) return null;
  const conflict = await store.host.call('driveConflicts', 'find', cursor);
  if (conflict === undefined || !rootIds.includes(conflict.rootId)) throw unknownCursor();
  return { at: conflict.at, id: conflict.id };
}

async function visibleRootIds(
  read: DriveReadService,
  actor: DriveActor,
  rootId: string | undefined,
): Promise<readonly string[]> {
  return rootId === undefined
    ? (await read.listRoots(actor)).map((root) => root.id)
    : [(await read.rootFor(actor, rootId)).id];
}

export interface ListingSources {
  readonly store: ListingStore;
  readonly read: DriveReadService;
  readonly duplicates: Pick<DuplicatesService, 'groups'>;
}

export function driveListings(sources: ListingSources): DriveListings {
  const { store, read, duplicates } = sources;
  return {
    shares: async (actor, query) =>
      pageOf(
        await store.host.read('driveSharesMadeBy', {
          actor,
          itemId: query.itemId,
          albumId: query.albumId,
          cursor: query.cursor,
          limit: DRIVE_PAGE_SIZE + 1,
        }),
      ),
    conflicts: async (actor, query): Promise<DrivePage<DriveConflict>> => {
      const rootIds = await visibleRootIds(read, actor, query.rootId);
      return pageOf(
        await store.host.call('driveConflicts', 'page', {
          rootIds,
          after: await conflictAfter(store, rootIds, query.cursor),
          limit: DRIVE_PAGE_SIZE + 1,
        }),
      );
    },
    duplicates: async (actor, query): Promise<DrivePage<DriveDuplicateGroup>> => {
      if (query.rootId !== undefined) await read.rootFor(actor, query.rootId);
      const page = await duplicates.groups(
        actor,
        { media: false, rootId: query.rootId },
        query.cursor,
      );
      return {
        items: page.groups.map(({ sha256, bytes, items }) => ({ sha256, bytes, items })),
        next: page.next,
      };
    },
  };
}
