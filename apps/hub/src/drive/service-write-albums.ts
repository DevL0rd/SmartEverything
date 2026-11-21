import type {
  DriveAlbum,
  DriveAlbumChange,
  DriveAlbumCreate,
  DriveAlbumSurface,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { DriveActor } from './access';
import type { AlbumCursor } from './albums';
import type { AlbumMembers } from './units/albums';

export type AlbumEditing = Pick<
  DriveAlbums,
  'create' | 'update' | 'remove' | 'addItems' | 'removeItems'
>;

export class DriveAlbums {
  constructor(private readonly store: Pick<Store, 'host'>) {}

  list(actor: DriveActor, surface: DriveAlbumSurface): Promise<DriveAlbum[]> {
    return this.store.host.read('driveAlbumsList', { actor, surface });
  }

  members(
    albumId: string,
    actor: DriveActor,
    cursor: AlbumCursor | null,
    limit: number,
  ): Promise<AlbumMembers> {
    return this.store.host.read('driveAlbumMembers', { actor, albumId, cursor, limit });
  }

  create(actor: DriveActor, create: DriveAlbumCreate): Promise<DriveAlbum> {
    return this.store.host.write('driveAlbumCreate', { actor, create });
  }

  update(actor: DriveActor, albumId: string, change: DriveAlbumChange): Promise<DriveAlbum> {
    return this.store.host.write('driveAlbumUpdate', { actor, albumId, change });
  }

  remove(actor: DriveActor, albumId: string): Promise<void> {
    return this.store.host.write('driveAlbumRemove', { actor, albumId });
  }

  addItems(albumId: string, itemIds: readonly string[], actor: DriveActor): Promise<DriveAlbum> {
    return this.store.host.write('driveAlbumAddItems', { actor, albumId, itemIds });
  }

  removeItems(albumId: string, itemIds: readonly string[], actor: DriveActor): Promise<DriveAlbum> {
    return this.store.host.write('driveAlbumRemoveItems', { actor, albumId, itemIds });
  }
}
