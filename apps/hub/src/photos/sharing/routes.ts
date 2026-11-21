import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { DONE_REPLY, bound, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';

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

function albumRoutes(
  store: Store,
): Pick<
  PhotoSharingRoutes,
  | 'readPhotoSharing'
  | 'setPhotoAlbumMembers'
  | 'removePhotoAlbumMember'
  | 'joinPhotoAlbum'
  | 'leavePhotoAlbum'
> {
  const { host } = store;
  return {
    readPhotoSharing: bound(E.readPhotoSharing, ({ caller }) =>
      host.read('photoSharing', { actor: photoActor(caller) }),
    ),
    setPhotoAlbumMembers: bound(E.setPhotoAlbumMembers, ({ params, body, caller }) =>
      host.write('photoAlbumMembersSet', {
        actor: photoActor(caller),
        albumId: params.albumId,
        members: body,
      }),
    ),
    removePhotoAlbumMember: bound(E.removePhotoAlbumMember, async ({ params, caller }) => {
      await host.write('photoAlbumMemberRemove', {
        actor: photoActor(caller),
        albumId: params.albumId,
        profileId: params.profileId,
      });
      return DONE_REPLY;
    }),
    joinPhotoAlbum: bound(E.joinPhotoAlbum, ({ params, caller }) =>
      host.write('photoAlbumJoin', { actor: photoActor(caller), albumId: params.albumId }),
    ),
    leavePhotoAlbum: bound(E.leavePhotoAlbum, async ({ params, caller }) => {
      await host.write('photoAlbumLeave', {
        actor: photoActor(caller),
        albumId: params.albumId,
      });
      return DONE_REPLY;
    }),
  };
}

function activityRoutes(
  store: Store,
): Pick<
  PhotoSharingRoutes,
  'listPhotoAlbumActivity' | 'addPhotoAlbumActivity' | 'removePhotoAlbumActivity'
> {
  const { host } = store;
  return {
    listPhotoAlbumActivity: bound(E.listPhotoAlbumActivity, ({ params, query, caller }) =>
      host.write('photoAlbumActivityPage', {
        actor: photoActor(caller),
        albumId: params.albumId,
        cursor: query.cursor,
      }),
    ),
    addPhotoAlbumActivity: bound(E.addPhotoAlbumActivity, ({ params, body, caller }) =>
      host.write('photoAlbumActivityAdd', {
        actor: photoActor(caller),
        albumId: params.albumId,
        activity: body,
      }),
    ),
    removePhotoAlbumActivity: bound(E.removePhotoAlbumActivity, async ({ params, caller }) => {
      await host.write('photoAlbumActivityRemove', {
        actor: photoActor(caller),
        albumId: params.albumId,
        activityId: params.activityId,
      });
      return DONE_REPLY;
    }),
  };
}

function partnerRoutes(
  store: Store,
): Pick<
  PhotoSharingRoutes,
  | 'setPhotoPartner'
  | 'acceptPhotoPartner'
  | 'stopPhotoPartner'
  | 'savePartnerPhotos'
  | 'setPartnerAutoSave'
> {
  const { host } = store;
  return {
    setPhotoPartner: bound(E.setPhotoPartner, ({ body, caller }) =>
      host.write('photoPartnerSet', { actor: photoActor(caller), partner: body }),
    ),
    acceptPhotoPartner: bound(E.acceptPhotoPartner, ({ params, caller }) =>
      host.write('photoPartnerAccept', {
        actor: photoActor(caller),
        shareId: params.shareId,
      }),
    ),
    stopPhotoPartner: bound(E.stopPhotoPartner, ({ params, caller }) =>
      host.write('photoPartnerStop', { actor: photoActor(caller), shareId: params.shareId }),
    ),
    savePartnerPhotos: bound(E.savePartnerPhotos, ({ params, body, caller }) =>
      host.write('photoPartnerSave', {
        actor: photoActor(caller),
        shareId: params.shareId,
        save: body,
      }),
    ),
    setPartnerAutoSave: bound(E.setPartnerAutoSave, ({ params, body, caller }) =>
      host.write('photoPartnerAutoSaveSet', {
        actor: photoActor(caller),
        shareId: params.shareId,
        autoSave: body,
      }),
    ),
  };
}

export function photoSharingRoutes(store: Store): PhotoSharingRoutes {
  return {
    ...albumRoutes(store),
    ...activityRoutes(store),
    ...partnerRoutes(store),
  };
}
