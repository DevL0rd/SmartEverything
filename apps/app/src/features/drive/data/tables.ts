import type { DriveAlbumSurface, DrivePlacement } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { useRow, useRows } from '../../../store/selectors';
import { rowsOf, type RowOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { placementsOn } from '../computers/placement-model';
import type { DriveRootPlace } from '../model/drive-access';

export function useDriveRoots(): readonly RowOf<'drive_roots'>[] {
  return useRows('drive_roots');
}

const rootsTable = (state: StoreState): readonly unknown[] => [state.tables.drive_roots];

function placeOf(root: RowOf<'drive_roots'>): DriveRootPlace {
  return {
    id: root.id,
    scope: root.scope,
    ownerProfileId: root.ownerProfileId,
    state: root.state,
    stateReason: root.stateReason,
    versions: root.versions,
  };
}

function samePlace(left: DriveRootPlace, right: DriveRootPlace): boolean {
  return (
    left.id === right.id &&
    left.scope === right.scope &&
    left.ownerProfileId === right.ownerProfileId &&
    left.state === right.state &&
    left.stateReason === right.stateReason &&
    left.versions === right.versions
  );
}

function rootPlacesSelector(): (state: StoreState) => readonly DriveRootPlace[] {
  let held: readonly DriveRootPlace[] = [];
  return memoOnInputs(rootsTable, (state) => {
    const before = new Map(held.map((place) => [place.id, place]));
    const now = rowsOf(state.tables.drive_roots).map((root) => {
      const place = placeOf(root);
      const was = before.get(root.id);
      return was !== undefined && samePlace(was, place) ? was : place;
    });
    if (!shallowEqual(held, now)) held = now;
    return held;
  });
}

export const driveRootPlacesIn = rootPlacesSelector();

export function useDriveRootPlaces(): readonly DriveRootPlace[] {
  return useStoreSelector(driveRootPlacesIn);
}

export function useDriveRoot(rootId: string | null): RowOf<'drive_roots'> | null {
  return useRow('drive_roots', rootId);
}

export function useDriveRootBytes(rootId: string | null): number | null {
  return useStoreSelector(
    (state) => (rootId === null ? null : (state.tables.drive_roots.byId[rootId]?.bytes ?? null)),
    Object.is,
    [rootId],
  );
}

export function useDriveAlbums(surface: DriveAlbumSurface): readonly RowOf<'drive_albums'>[] {
  return useRows('drive_albums').filter((album) => album.surface === surface);
}

export function useDriveGrantRows(): readonly RowOf<'drive_grants'>[] {
  return useRows('drive_grants');
}

export function useDrivePlacementRows(): readonly RowOf<'drive_placements'>[] {
  return useRows('drive_placements');
}

export type PlacementsByDevice = ReadonlyMap<string, readonly DrivePlacement[]>;

const NO_PLACEMENTS: readonly DrivePlacement[] = [];

const placementsTable = (state: StoreState): readonly unknown[] => [state.tables.drive_placements];

function placementsByDeviceSelector(): (state: StoreState) => PlacementsByDevice {
  let held: PlacementsByDevice = new Map();
  return memoOnInputs(placementsTable, (state) => {
    const rows = rowsOf(state.tables.drive_placements);
    const devices = new Set(rows.map((row) => row.deviceId));
    held = new Map(
      [...devices].map((deviceId) => {
        const now = placementsOn(deviceId, rows);
        const before = held.get(deviceId);
        return [deviceId, before !== undefined && shallowEqual(before, now) ? before : now];
      }),
    );
    return held;
  });
}

export const placementsByDeviceIn = placementsByDeviceSelector();

export function useDrivePlacementsByDevice(): PlacementsByDevice {
  return useStoreSelector(placementsByDeviceIn);
}

export function placementsOf(
  byDevice: PlacementsByDevice,
  deviceId: string,
): readonly DrivePlacement[] {
  return byDevice.get(deviceId) ?? NO_PLACEMENTS;
}

export function useDriveNotificationRows(): readonly RowOf<'drive_notifications'>[] {
  return useRows('drive_notifications');
}

export function unreadNotificationCount(rows: readonly RowOf<'drive_notifications'>[]): number {
  return rows.filter((row) => row.readAt === null).length;
}

export function useUnreadDriveNotifications(): number {
  return unreadNotificationCount(useDriveNotificationRows());
}

export function useDriveAccessRequestRows(): readonly RowOf<'drive_access_requests'>[] {
  return useRows('drive_access_requests');
}

export function waitingAccessRequests(
  rows: readonly RowOf<'drive_access_requests'>[],
  viewerId: string | null,
): readonly RowOf<'drive_access_requests'>[] {
  return rows.filter((row) => row.state === 'pending' && row.ownerProfileId === viewerId);
}

export function useDriveFileRequestRows(): readonly RowOf<'drive_file_requests'>[] {
  return useRows('drive_file_requests');
}

export function useDriveTransferRows(): readonly RowOf<'drive_transfers'>[] {
  return useRows('drive_transfers');
}

export function offeredTransfers(
  rows: readonly RowOf<'drive_transfers'>[],
  viewerId: string | null,
): readonly RowOf<'drive_transfers'>[] {
  return rows.filter((row) => row.state === 'offered' && row.toProfileId === viewerId);
}

export function useDriveOfflineRows(): readonly RowOf<'drive_offline_items'>[] {
  return useRows('drive_offline_items');
}

export function offlineItemsOf(
  rows: readonly RowOf<'drive_offline_items'>[],
  clientId: string,
): ReadonlyMap<string, RowOf<'drive_offline_items'>> {
  return new Map(rows.filter((row) => row.clientId === clientId).map((row) => [row.itemId, row]));
}
