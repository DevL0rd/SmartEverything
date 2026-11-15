import {
  PHOTOS_ENDPOINTS as P,
  type AlbumActivityCreate,
  type AlbumMembersSet,
  type PartnerSet,
} from '@smarteverything/domain';
import type { PhotosResult } from '../../../api/photos';
import { api } from '../../../api/transport';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export function readPhotoSharing(): Call<'readPhotoSharing'> {
  return api().call(P.readPhotoSharing, {});
}

export function setAlbumMembers(
  albumId: string,
  body: AlbumMembersSet,
): Call<'setPhotoAlbumMembers'> {
  return api().call(P.setPhotoAlbumMembers, { params: { albumId }, body });
}

export function removeAlbumMember(
  albumId: string,
  profileId: string,
): Call<'removePhotoAlbumMember'> {
  return api().call(P.removePhotoAlbumMember, { params: { albumId, profileId } });
}

export function joinAlbum(albumId: string): Call<'joinPhotoAlbum'> {
  return api().call(P.joinPhotoAlbum, { params: { albumId } });
}

export function leaveAlbum(albumId: string): Call<'leavePhotoAlbum'> {
  return api().call(P.leavePhotoAlbum, { params: { albumId } });
}

export function listAlbumActivity(
  albumId: string,
  cursor: string | null,
): Call<'listPhotoAlbumActivity'> {
  return api().call(P.listPhotoAlbumActivity, {
    params: { albumId },
    query: cursor === null ? {} : { cursor },
  });
}

export function addAlbumActivity(
  albumId: string,
  body: AlbumActivityCreate,
): Call<'addPhotoAlbumActivity'> {
  return api().call(P.addPhotoAlbumActivity, { params: { albumId }, body });
}

export function removeAlbumActivity(
  albumId: string,
  activityId: string,
): Call<'removePhotoAlbumActivity'> {
  return api().call(P.removePhotoAlbumActivity, { params: { albumId, activityId } });
}

export function setPartner(body: PartnerSet): Call<'setPhotoPartner'> {
  return api().call(P.setPhotoPartner, { body });
}

export function acceptPartner(shareId: string): Call<'acceptPhotoPartner'> {
  return api().call(P.acceptPhotoPartner, { params: { shareId } });
}

export function stopPartner(shareId: string): Call<'stopPhotoPartner'> {
  return api().call(P.stopPhotoPartner, { params: { shareId } });
}

export function savePartnerPhotos(
  shareId: string,
  itemIds: readonly string[],
): Call<'savePartnerPhotos'> {
  return api().call(P.savePartnerPhotos, { params: { shareId }, body: { itemIds: [...itemIds] } });
}

export function setPartnerAutoSave(shareId: string, autoSave: boolean): Call<'setPartnerAutoSave'> {
  return api().call(P.setPartnerAutoSave, { params: { shareId }, body: { autoSave } });
}
