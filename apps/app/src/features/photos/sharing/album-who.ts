import type { DriveAlbum } from '@smarteverything/domain';
import { visibilityOf, type Visibility } from '../albums/model';
import { membersLine } from './model';
import { usePhotoSharing } from './queries';

export function whoSeesOf(album: DriveAlbum, memberIds: readonly string[] | undefined): Visibility {
  if (memberIds === undefined || memberIds.length === 0) return visibilityOf(album.scope);
  return { label: membersLine(memberIds), icon: 'users' };
}

export function useWhoSees(album: DriveAlbum): Visibility {
  const shared = usePhotoSharing().data?.albums.find((entry) => entry.albumId === album.id);
  return whoSeesOf(album, shared?.memberIds);
}
