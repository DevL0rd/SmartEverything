import type { DriveAlbumSurface } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import type { RowOf } from '../../../store/state';

export function useDriveRoots(): readonly RowOf<'drive_roots'>[] {
  return useRows('drive_roots');
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
