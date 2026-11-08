import type { DriveAlbum, DriveAlbumChange, DriveAlbumCreate } from '@smarteverything/domain';
import type { DriveAlbumsService } from './albums';
import type { DriveCaller } from './service-write-support';

export type AlbumEditing = Pick<
  DriveAlbumsService,
  'create' | 'get' | 'rename' | 'setRule' | 'setCover' | 'remove' | 'addItems' | 'removeItems'
>;

export class DriveAlbumWriter {
  constructor(private readonly albums: AlbumEditing) {}

  create(caller: DriveCaller, input: DriveAlbumCreate): DriveAlbum {
    const base = { title: input.title, surface: input.surface, scope: input.scope };
    if (input.kind === 'smart') {
      return this.albums.create({ ...base, kind: 'smart', rule: input.rule }, caller);
    }
    const created = this.albums.create({ ...base, kind: 'manual' }, caller);
    return input.itemIds.length === 0
      ? created
      : this.albums.addItems(created.id, input.itemIds, caller);
  }

  update(caller: DriveCaller, albumId: string, change: DriveAlbumChange): DriveAlbum {
    if (change.title !== undefined) {
      this.albums.rename(albumId, change.title, caller);
    }
    if (change.rule !== undefined) {
      this.albums.setRule(albumId, change.rule, caller);
    }
    if (change.coverItemId !== undefined) {
      this.albums.setCover(albumId, change.coverItemId, caller);
    }
    return this.albums.get(albumId, caller);
  }

  remove(caller: DriveCaller, albumId: string): void {
    this.albums.remove(albumId, caller);
  }
}
