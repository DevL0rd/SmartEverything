import type { DriveAlbumSurface } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import type { RowOf } from '../../../store/state';

export function useDriveRoots(): readonly RowOf<'drive_roots'>[] {
  return useRows('drive_roots');
}

export function useDriveAlbums(surface: DriveAlbumSurface): readonly RowOf<'drive_albums'>[] {
  return useRows('drive_albums').filter((album) => album.surface === surface);
}

export function useDriveSyncClients(): readonly RowOf<'drive_sync_clients'>[] {
  return useRows('drive_sync_clients');
}
