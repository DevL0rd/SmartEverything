import { randomUUID } from 'node:crypto';
import type { PhotoPartnerShareRow } from '../../store/repositories/photo-partner-shares';
import type { HostStore } from '../../store/host/host-store';

export type SavedStore = Pick<HostStore, 'driveAlbums' | 'photoPartnerShares' | 'profiles'>;

export class SavedAlbums {
  constructor(private readonly store: SavedStore) {}

  ensure(share: PhotoPartnerShareRow): string {
    const known = this.store.photoPartnerShares.savedAlbumId(share.sharerId, share.recipientId);
    const album = known === undefined ? undefined : this.store.driveAlbums.find(known);
    if (album?.ownerProfileId === share.recipientId) return album.id;
    const sharer = this.store.profiles.byId(share.sharerId);
    const created = this.store.driveAlbums.insert({
      id: randomUUID(),
      title: `From ${sharer.name}`,
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: share.recipientId,
      coverItemId: null,
    });
    this.store.photoPartnerShares.saveAlbum(share.sharerId, share.recipientId, created.id);
    return created.id;
  }
}
