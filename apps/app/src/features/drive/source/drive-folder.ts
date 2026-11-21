import { background } from '@smarteverything/logging';
import type { DriveItem } from '@smarteverything/domain';
import { type DriveResult, readDriveItem } from '../../../api/drive';
import { browseDrive, listDriveTrash } from '../../../api/drive-pages';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  sortNodes,
  type FileCrumb,
  type FileLocation,
  type FilePlace,
  type FileSortOrder,
  type FolderListing,
} from '../../files';
import { useIsOwner } from '../../../store/selectors';
import { flattenPages } from '../data';
import { useDrivePages, type CursorPage, type DrivePages } from '../data/pages';
import { ancestorsOf, crumbsOf, driveSortOf } from './drive-listing';
import {
  driveNodeOf,
  entriesOf,
  trashNodeOf,
  type DriveNode,
  type DriveNodeContext,
  type DriveOrigin,
} from './drive-node';
import { DRIVE_PLACES, coverOf } from './drive-places';
import { useDriveLocation, useDrivePlaces, type DriveLocationState } from './drive-location';

const NO_BY = (): string | null => null;

function stopOf(state: DriveLocationState): string | null {
  const { folder } = state;
  return folder === null ? null : (coverOf(state.context.shared, folder)?.top.id ?? null);
}

export function useDriveAncestors(
  item: DriveItem | null,
  stopAt: string | null,
  enabled: boolean,
): readonly DriveItem[] | undefined {
  const scope = { rootId: item?.rootId ?? null, folderId: item?.id ?? null, albumId: null };
  return useScreenQuery({
    queryKey: driveKey('folder', scope, 'ancestors', stopAt),
    queryFn: ({ signal }): Promise<readonly DriveItem[]> =>
      item === null
        ? Promise.resolve([])
        : ancestorsOf(item, (id, abort) => readDriveItem(id, { signal: abort }), stopAt, signal),
    enabled: item !== null && enabled,
    retry: false,
  }).data;
}

function useCrumbs(
  location: FileLocation,
  state: DriveLocationState,
  places: readonly FilePlace[],
): readonly FileCrumb<DriveOrigin>[] {
  const { folder } = state;
  const ready = state.place !== DRIVE_PLACES.sharedWithMe || state.sharedComplete;
  const ancestors = useDriveAncestors(folder, stopOf(state), ready);
  const place = places.find((candidate) => candidate.key === location.place);
  const chain = [...(ancestors ?? []), ...(folder === null ? [] : [folder])];
  return crumbsOf(place, location.place, chain, state.context);
}

export interface PageState {
  readonly pending: boolean;
  readonly complete: boolean;
  readonly placeholder: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

export function pageStateOf<P extends CursorPage>(pages: DrivePages<P>, on: boolean): PageState {
  return {
    pending: on && pages.isPending,
    complete: pages.data !== undefined && !pages.hasNextPage,
    placeholder: pages.isPlaceholderData,
    error: on ? pages.error : null,
    more:
      on && pages.hasNextPage && !pages.isFetchingNextPage
        ? (): void => {
            background(pages.fetchNextPage(), 'drive.source.more_failed');
          }
        : null,
    retry: (): void => {
      background(pages.refetch(), 'drive.source.retry_failed');
    },
  };
}

interface Shape {
  readonly trash: boolean;
  readonly sharedTop: boolean;
  readonly browsing: boolean;
}

function shapeOf(state: DriveLocationState, location: FileLocation): Shape {
  const trash = state.place === DRIVE_PLACES.trash;
  const sharedTop = state.place === DRIVE_PLACES.sharedWithMe && location.folder === null;
  return { trash, sharedTop, browsing: !trash && !sharedTop && state.rootId !== null };
}

function useBrowsePages(
  state: DriveLocationState,
  location: FileLocation,
  sort: FileSortOrder,
  on: boolean,
): DrivePages<DriveResult<'browseFolder'>> {
  const { rootId } = state;
  const folderId = state.place === DRIVE_PLACES.trash ? null : location.folder;
  const sorted = driveSortOf(sort);
  return useDrivePages({
    queryKey: driveKey('folder', { rootId, folderId, albumId: null }, sorted),
    read: (cursor, signal) =>
      browseDrive(
        {
          rootId: rootId ?? '',
          ...(folderId === null ? {} : { folderId }),
          ...(sorted === null ? {} : { sortField: sorted.field, sortDirection: sorted.direction }),
          ...(cursor === null ? {} : { cursor }),
        },
        signal,
      ),
    enabled: on,
  });
}

function useTrashPages(on: boolean): DrivePages<DriveResult<'listTrash'>> {
  return useDrivePages({
    queryKey: driveKey('trash', DRIVE_EVERYWHERE),
    read: (cursor, signal) => listDriveTrash(null, cursor, signal),
    enabled: on,
  });
}

function arrangedOf(
  shape: Shape,
  context: DriveNodeContext,
  sort: FileSortOrder,
  parts: {
    readonly loaded: readonly DriveItem[];
    readonly shortcuts: Parameters<typeof entriesOf>[1];
    readonly trashed: readonly DriveNode[];
  },
): readonly DriveNode[] {
  if (shape.trash) return sortNodes(parts.trashed, sort, NO_BY);
  if (shape.sharedTop) {
    return sortNodes(
      context.shared.map((entry) => driveNodeOf(entry.item, context)),
      sort,
      NO_BY,
    );
  }
  return entriesOf(parts.loaded, parts.shortcuts, context);
}

function activeOf(shape: Shape, browse: PageState, trash: PageState): PageState | null {
  if (shape.trash) return trash;
  return shape.browsing ? browse : null;
}

interface Status {
  readonly complete: boolean;
  readonly loading: boolean;
  readonly stale: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

const NOTHING: () => void = () => undefined;

function statusOf(active: PageState | null, state: DriveLocationState): Status {
  if (active === null) {
    return {
      complete: state.sharedComplete,
      loading: !state.sharedComplete || state.folderLoading,
      stale: false,
      error: state.folderError,
      more: null,
      retry: NOTHING,
    };
  }
  return {
    complete: active.complete,
    loading: active.pending || state.folderLoading,
    stale: active.placeholder,
    error: active.error ?? state.folderError,
    more: active.more,
    retry: active.retry,
  };
}

export function useDriveListing(
  location: FileLocation,
  sort: FileSortOrder,
): FolderListing<DriveOrigin> {
  const state = useDriveLocation(location);
  const crumbs = useCrumbs(location, state, useDrivePlaces());
  const rights = { owner: useIsOwner(), ...state.context };
  const shape = shapeOf(state, location);
  const pages = useBrowsePages(state, location, sort, shape.browsing);
  const trashPages = useTrashPages(shape.trash);
  const active = activeOf(
    shape,
    pageStateOf(pages, shape.browsing),
    pageStateOf(trashPages, shape.trash),
  );
  const first = pages.data?.pages[0];
  const entries = arrangedOf(shape, state.context, sort, {
    loaded: flattenPages(pages.data, (page) => page.items),
    shortcuts: first?.shortcuts ?? [],
    trashed: flattenPages(trashPages.data, (page) => page.items).map((entry) =>
      trashNodeOf(entry, rights),
    ),
  });
  const status = statusOf(active, state);
  const folder = first?.folder ?? state.folder;
  return {
    entries,
    folder: folder === null ? null : driveNodeOf(folder, state.context),
    crumbs,
    total: status.complete ? entries.length : null,
    ...status,
  };
}
