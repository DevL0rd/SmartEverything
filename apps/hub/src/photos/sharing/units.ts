import type { DriveActor } from '../../drive/access';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { AlbumActivityService } from './activity';
import { PartnerAutoSaver } from './auto-save';
import { SharedAlbumMembers } from './members';
import { PartnerSharing } from './partners';
import { SharingReader } from './reads';
import { SavedAlbums } from './saved';
import { AlbumSeen } from './seen';

interface SharingServices {
  readonly reader: SharingReader;
  readonly members: SharedAlbumMembers;
  readonly activity: AlbumActivityService;
  readonly partners: PartnerSharing;
}

function sharingOf(store: Store): SharingServices {
  const seen = new AlbumSeen(store);
  const saved = new SavedAlbums(store);
  return {
    reader: new SharingReader(store, seen),
    members: new SharedAlbumMembers(store, seen),
    activity: new AlbumActivityService(store, seen, () => store.now()),
    partners: new PartnerSharing(store, saved, new PartnerAutoSaver(store, saved)),
  };
}

export interface Actor {
  readonly actor: DriveActor;
}

export interface InAlbum extends Actor {
  readonly albumId: string;
}

export interface OfShare extends Actor {
  readonly shareId: string;
}

export const PHOTO_SHARING_UNIT = storeUnit((store, input: Actor) =>
  sharingOf(store).reader.read(input.actor),
);

export const PHOTO_ALBUM_MEMBERS_SET_UNIT = storeUnit(
  (store, input: InAlbum & { readonly members: Parameters<SharedAlbumMembers['set']>[2] }) =>
    sharingOf(store).members.set(input.actor, input.albumId, input.members),
);

export const PHOTO_ALBUM_MEMBER_REMOVE_UNIT = storeUnit(
  (store, input: InAlbum & { readonly profileId: string }) => {
    sharingOf(store).members.remove(input.actor, input.albumId, input.profileId);
  },
);

export const PHOTO_ALBUM_JOIN_UNIT = storeUnit((store, input: InAlbum) =>
  sharingOf(store).members.join(input.actor, input.albumId),
);

export const PHOTO_ALBUM_LEAVE_UNIT = storeUnit((store, input: InAlbum) => {
  sharingOf(store).members.leave(input.actor, input.albumId);
});

export const PHOTO_ALBUM_ACTIVITY_PAGE_UNIT = storeUnit(
  (store, input: InAlbum & { readonly cursor: string | undefined }) =>
    sharingOf(store).activity.page(input.actor, input.albumId, input.cursor),
);

export const PHOTO_ALBUM_ACTIVITY_ADD_UNIT = storeUnit(
  (store, input: InAlbum & { readonly activity: Parameters<AlbumActivityService['add']>[2] }) =>
    sharingOf(store).activity.add(input.actor, input.albumId, input.activity),
);

export const PHOTO_ALBUM_ACTIVITY_REMOVE_UNIT = storeUnit(
  (store, input: InAlbum & { readonly activityId: string }) => {
    sharingOf(store).activity.remove(input.actor, input.albumId, input.activityId);
  },
);

export const PHOTO_PARTNER_SET_UNIT = storeUnit(
  (store, input: Actor & { readonly partner: Parameters<PartnerSharing['set']>[1] }) =>
    sharingOf(store).partners.set(input.actor, input.partner),
);

export const PHOTO_PARTNER_ACCEPT_UNIT = storeUnit((store, input: OfShare) =>
  sharingOf(store).partners.accept(input.actor, input.shareId),
);

export const PHOTO_PARTNER_STOP_UNIT = storeUnit((store, input: OfShare) =>
  sharingOf(store).partners.stop(input.actor, input.shareId),
);

export const PHOTO_PARTNER_SAVE_UNIT = storeUnit(
  (store, input: OfShare & { readonly save: Parameters<PartnerSharing['save']>[2] }) =>
    sharingOf(store).partners.save(input.actor, input.shareId, input.save),
);

export const PHOTO_PARTNER_AUTO_SAVE_SET_UNIT = storeUnit(
  (store, input: OfShare & { readonly autoSave: Parameters<PartnerSharing['setAutoSave']>[2] }) =>
    sharingOf(store).partners.setAutoSave(input.actor, input.shareId, input.autoSave),
);
