import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { DONE_REPLY, bound, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';
import type { AlbumActivityService } from './activity';
import type { SharedAlbumMembers } from './members';
import type { PartnerSharing } from './partners';
import type { SharingReader } from './reads';

const E = PHOTOS_ENDPOINTS;

type RouteName =
  | 'readPhotoSharing'
  | 'setPhotoAlbumMembers'
  | 'removePhotoAlbumMember'
  | 'joinPhotoAlbum'
  | 'leavePhotoAlbum'
  | 'listPhotoAlbumActivity'
  | 'addPhotoAlbumActivity'
  | 'removePhotoAlbumActivity'
  | 'setPhotoPartner'
  | 'acceptPhotoPartner'
  | 'stopPhotoPartner'
  | 'savePartnerPhotos'
  | 'setPartnerAutoSave';

export type PhotoSharingRoutes = { readonly [N in RouteName]: Bound<(typeof E)[N]> };

export interface SharingServices {
  readonly reader: SharingReader;
  readonly members: SharedAlbumMembers;
  readonly activity: AlbumActivityService;
  readonly partners: PartnerSharing;
}

function albumRoutes(
  store: Store,
  services: SharingServices,
): Pick<
  PhotoSharingRoutes,
  | 'readPhotoSharing'
  | 'setPhotoAlbumMembers'
  | 'removePhotoAlbumMember'
  | 'joinPhotoAlbum'
  | 'leavePhotoAlbum'
> {
  return {
    readPhotoSharing: bound(E.readPhotoSharing, ({ caller }) =>
      services.reader.read(photoActor(store, caller)),
    ),
    setPhotoAlbumMembers: bound(E.setPhotoAlbumMembers, ({ params, body, caller }) =>
      services.members.set(photoActor(store, caller), params.albumId, body),
    ),
    removePhotoAlbumMember: bound(E.removePhotoAlbumMember, ({ params, caller }) => {
      services.members.remove(photoActor(store, caller), params.albumId, params.profileId);
      return DONE_REPLY;
    }),
    joinPhotoAlbum: bound(E.joinPhotoAlbum, ({ params, caller }) =>
      services.members.join(photoActor(store, caller), params.albumId),
    ),
    leavePhotoAlbum: bound(E.leavePhotoAlbum, ({ params, caller }) => {
      services.members.leave(photoActor(store, caller), params.albumId);
      return DONE_REPLY;
    }),
  };
}

function activityRoutes(
  store: Store,
  services: SharingServices,
): Pick<
  PhotoSharingRoutes,
  'listPhotoAlbumActivity' | 'addPhotoAlbumActivity' | 'removePhotoAlbumActivity'
> {
  return {
    listPhotoAlbumActivity: bound(E.listPhotoAlbumActivity, ({ params, query, caller }) =>
      services.activity.page(photoActor(store, caller), params.albumId, query.cursor),
    ),
    addPhotoAlbumActivity: bound(E.addPhotoAlbumActivity, ({ params, body, caller }) =>
      services.activity.add(photoActor(store, caller), params.albumId, body),
    ),
    removePhotoAlbumActivity: bound(E.removePhotoAlbumActivity, ({ params, caller }) => {
      services.activity.remove(photoActor(store, caller), params.albumId, params.activityId);
      return DONE_REPLY;
    }),
  };
}

function partnerRoutes(
  store: Store,
  services: SharingServices,
): Pick<
  PhotoSharingRoutes,
  | 'setPhotoPartner'
  | 'acceptPhotoPartner'
  | 'stopPhotoPartner'
  | 'savePartnerPhotos'
  | 'setPartnerAutoSave'
> {
  return {
    setPhotoPartner: bound(E.setPhotoPartner, ({ body, caller }) =>
      services.partners.set(photoActor(store, caller), body),
    ),
    acceptPhotoPartner: bound(E.acceptPhotoPartner, ({ params, caller }) =>
      services.partners.accept(photoActor(store, caller), params.shareId),
    ),
    stopPhotoPartner: bound(E.stopPhotoPartner, ({ params, caller }) =>
      services.partners.stop(photoActor(store, caller), params.shareId),
    ),
    savePartnerPhotos: bound(E.savePartnerPhotos, ({ params, body, caller }) =>
      services.partners.save(photoActor(store, caller), params.shareId, body),
    ),
    setPartnerAutoSave: bound(E.setPartnerAutoSave, ({ params, body, caller }) =>
      services.partners.setAutoSave(photoActor(store, caller), params.shareId, body),
    ),
  };
}

export function photoSharingRoutes(store: Store, services: SharingServices): PhotoSharingRoutes {
  return {
    ...albumRoutes(store, services),
    ...activityRoutes(store, services),
    ...partnerRoutes(store, services),
  };
}
