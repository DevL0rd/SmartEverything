import { useEffect } from 'react';
import type { DriveItem, DriveOfflineState } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useSession, useSyncStatus } from '../../../store/selectors';
import {
  NO_ABILITIES,
  type FileAbilities,
  type FileLocation,
  type FilePlace,
  type PlacementMark,
} from '../../files';
import {
  flattenPages,
  useDriveItem,
  useDriveOfflineRows,
  useDrivePlacementRows,
  useDriveRootPlaces,
  useSharedWithMe,
  useViewerId,
} from '../data';
import type { DriveAccess } from '../model/drive-access';
import { nativeDriveProvider } from '../phone/provider';
import { driveAbilitiesOf } from './drive-abilities';
import type { DriveNodeContext } from './drive-node';
import {
  DRIVE_PLACES,
  accessOfItem,
  drivePlaceKeyOf,
  drivePlacesOf,
  isForeignRoot,
  rootOfPlace,
  type DrivePlaceKey,
} from './drive-places';

export function useAllShared(enabled: boolean): {
  readonly entries: DriveNodeContext['shared'];
  readonly complete: boolean;
} {
  const pages = useSharedWithMe(enabled);
  const more = enabled && pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError;
  const { fetchNextPage } = pages;
  useEffect(() => {
    if (more) background(fetchNextPage(), 'drive.source.shared_page_failed');
  }, [more, fetchNextPage]);
  return {
    entries: flattenPages(pages.data, (page) => page.items),
    complete: !enabled || (pages.data !== undefined && !pages.hasNextPage),
  };
}

export interface DriveLocationState {
  readonly place: DrivePlaceKey | null;
  readonly folder: DriveItem | null;
  readonly folderLoading: boolean;
  readonly folderError: unknown;
  readonly rootId: string | null;
  readonly context: DriveNodeContext;
  readonly sharedComplete: boolean;
  readonly access: DriveAccess;
  readonly online: boolean;
}

function offlineMapOf(
  rows: ReturnType<typeof useDriveOfflineRows>,
  clientId: string,
): ReadonlyMap<string, DriveOfflineState> {
  return new Map(
    rows.filter((row) => row.clientId === clientId).map((row) => [row.itemId, row.state]),
  );
}

function placementMapOf(
  rows: ReturnType<typeof useDrivePlacementRows>,
): ReadonlyMap<string, PlacementMark> {
  return new Map(
    rows.flatMap((row): [string, PlacementMark][] =>
      row.enabled && row.folderItemId !== null ? [[row.folderItemId, row.mode]] : [],
    ),
  );
}

const TOP_ACCESS: Readonly<Record<DrivePlaceKey, DriveAccess>> = {
  [DRIVE_PLACES.myDrive]: 'own',
  [DRIVE_PLACES.sharedDrive]: 'shared',
  [DRIVE_PLACES.sharedWithMe]: 'view',
  [DRIVE_PLACES.trash]: 'own',
};

function accessAtOf(
  place: DrivePlaceKey | null,
  folder: DriveItem | null,
  context: DriveNodeContext,
): DriveAccess {
  if (folder !== null) return accessOfItem(context, folder);
  return place === null ? 'none' : TOP_ACCESS[place];
}

interface FolderRead {
  readonly folder: DriveItem | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly rootId: string | null;
}

function useFolderRead(location: FileLocation, place: DrivePlaceKey | null): FolderRead {
  const roots = useDriveRootPlaces();
  const viewerId = useViewerId();
  const folderId = place === DRIVE_PLACES.trash ? null : location.folder;
  const item = useDriveItem(folderId, null);
  if (folderId === null) {
    return {
      folder: null,
      loading: false,
      error: null,
      rootId: rootOfPlace(location.place, roots, viewerId)?.id ?? null,
    };
  }
  const folder = item.data ?? null;
  return { folder, loading: item.isPending, error: item.error, rootId: folder?.rootId ?? null };
}

function needsShared(
  place: DrivePlaceKey | null,
  rootId: string | null,
  world: Pick<DriveNodeContext, 'roots' | 'viewerId'>,
): boolean {
  if (place === DRIVE_PLACES.sharedWithMe) return true;
  return rootId !== null && isForeignRoot(world.roots, rootId, world.viewerId);
}

function useContextWith(shared: DriveNodeContext['shared']): DriveNodeContext {
  const clientId = useSession().client.id;
  return {
    roots: useDriveRootPlaces(),
    viewerId: useViewerId(),
    shared,
    offline: offlineMapOf(useDriveOfflineRows(), clientId),
    placements: placementMapOf(useDrivePlacementRows()),
  };
}

export function useDriveNodeContext(): DriveNodeContext {
  return useContextWith(useAllShared(true).entries);
}

export function useDriveLocation(location: FileLocation): DriveLocationState {
  const place = drivePlaceKeyOf(location.place);
  const read = useFolderRead(location, place);
  const roots = useDriveRootPlaces();
  const viewerId = useViewerId();
  const shared = useAllShared(needsShared(place, read.rootId, { roots, viewerId }));
  const context = useContextWith(shared.entries);
  return {
    place,
    folder: read.folder,
    folderLoading: read.loading,
    folderError: read.error,
    rootId: read.rootId,
    context,
    sharedComplete: shared.complete,
    access: accessAtOf(place, read.folder, context),
    online: useSyncStatus().status === 'live',
  };
}

export function useDriveAbilities(location: FileLocation): FileAbilities {
  const state = useDriveLocation(location);
  if (state.place === null) return NO_ABILITIES;
  return driveAbilitiesOf({
    place: state.place,
    atTop: location.folder === null,
    access: state.access,
    online: state.online,
    phone: nativeDriveProvider.linked(),
  });
}

export function useDrivePlaces(): readonly FilePlace[] {
  return drivePlacesOf(useDriveRootPlaces(), useViewerId());
}
