import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveAlbumAccessError, DriveAlbumItemError } from '../../../src/drive/albums';
import { openKit, type Kit } from './fixture';

let kit: Kit;
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
});
afterEach(async () => {
  await kit.test.close();
});

function sharedAlbum(): { readonly albumId: string; readonly mine: string } {
  const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
  const albumId = kit.album(kit.alice, [mine]);
  kit.members.set(kit.alice, albumId, {
    members: [
      { profileId: kit.bob.profileId, role: 'contributor' },
      { profileId: kit.carol.profileId, role: 'viewer' },
    ],
  });
  kit.notices.length = 0;
  return { albumId, mine };
}

describe('comments and likes', () => {
  it('lets every member comment and like, on the album or on one photo', () => {
    const { albumId, mine } = sharedAlbum();
    const album = kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'Great trip' });
    const photo = kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine });
    expect(album).toMatchObject({ kind: 'comment', itemId: null, text: 'Great trip' });
    expect(photo).toMatchObject({ kind: 'like', itemId: mine, profileId: kit.bob.profileId });
    expect(kit.notices).toMatchObject([
      { type: 'photos_activity', albumId, kind: 'comment' },
      { type: 'photos_activity', albumId, kind: 'like' },
    ]);
  });

  it('answers a repeated like with the first one', () => {
    const { albumId, mine } = sharedAlbum();
    const first = kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine });
    kit.notices.length = 0;
    const again = kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine });
    expect(again.id).toBe(first.id);
    expect(kit.notices).toEqual([]);
    const albumLike = kit.activity.add(kit.bob, albumId, { kind: 'like' });
    expect(kit.activity.add(kit.bob, albumId, { kind: 'like' }).id).toBe(albumLike.id);
  });

  it('refuses people outside the album and photos that are not in it', () => {
    const { albumId } = sharedAlbum();
    const stranger = kit.store.profiles.create({ name: 'Dan' }).id;
    expect(() =>
      kit.activity.add({ profileId: stranger }, albumId, { kind: 'comment', text: 'Hi' }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
    const elsewhere = kit.seed({ n: 9, takenAt: taken, root: kit.aliceRoot });
    expect(() => kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: elsewhere })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('deletes only the caller own comments and likes', () => {
    const { albumId, mine } = sharedAlbum();
    const comment = kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'Nice' });
    const like = kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine });
    expect(() => {
      kit.activity.remove(kit.alice, albumId, comment.id);
    }).toThrow(expect.objectContaining({ code: 'not_found' }));
    kit.activity.remove(kit.bob, albumId, comment.id);
    kit.activity.remove(kit.bob, albumId, like.id);
    expect(kit.activity.page(kit.alice, albumId, undefined).items).toEqual([]);
    expect(() => {
      kit.activity.remove(kit.bob, albumId, like.id);
    }).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('keeps a join and a photo add out of what a person may delete', () => {
    const { albumId } = sharedAlbum();
    kit.members.join(kit.carol, albumId);
    const joined = kit.activity.page(kit.carol, albumId, undefined).items[0];
    expect(joined?.kind).toBe('joined');
    expect(() => {
      kit.activity.remove(kit.carol, albumId, joined?.id ?? '');
    }).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('pages the activity newest first', () => {
    const { albumId } = sharedAlbum();
    for (const text of ['one', 'two', 'three']) {
      kit.time.current = new Date(kit.time.current.getTime() + 1000);
      kit.activity.add(kit.bob, albumId, { kind: 'comment', text });
    }
    const page = kit.activity.page(kit.alice, albumId, undefined);
    expect(page.items.map((entry) => entry.text)).toEqual(['three', 'two', 'one']);
    expect(page.next).toBeNull();
  });
});

describe('unread activity', () => {
  it('counts what others did since the album was last opened', () => {
    const { albumId } = sharedAlbum();
    kit.time.current = new Date('2026-10-08T10:01:00.000Z');
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'First' });
    kit.activity.add(kit.alice, albumId, { kind: 'comment', text: 'Mine' });
    const before = kit.reader.read(kit.alice);
    expect(before.albums).toMatchObject([{ albumId, role: 'owner', unread: 1 }]);
    expect(before.unread).toBe(1);
    kit.time.current = new Date('2026-10-08T10:02:00.000Z');
    kit.activity.page(kit.alice, albumId, undefined);
    expect(kit.reader.unread(kit.alice)).toBe(0);
    kit.time.current = new Date('2026-10-08T10:03:00.000Z');
    kit.activity.add(kit.carol, albumId, { kind: 'like' });
    expect(kit.reader.unread(kit.alice)).toBe(1);
    expect(kit.reader.unread(kit.bob)).toBe(2);
  });

  it('lists the albums, the activity and the partners of the caller only', () => {
    const { albumId } = sharedAlbum();
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'Hello' });
    const stranger = { profileId: kit.store.profiles.create({ name: 'Dan' }).id };
    expect(kit.reader.read(stranger)).toEqual({
      albums: [],
      partners: [],
      activity: [],
      unread: 0,
    });
    const asBob = kit.reader.read(kit.bob);
    expect(asBob.albums).toMatchObject([
      { albumId, role: 'contributor', ownerProfileId: kit.alice.profileId },
    ]);
    expect(asBob.albums[0]?.memberIds).toEqual([kit.bob.profileId, kit.carol.profileId].sort());
    expect(asBob.activity.map((entry) => entry.text)).toEqual(['Hello']);
  });
});

describe('contributors', () => {
  it('add their own photos with their name on them and tell the others', () => {
    const { albumId } = sharedAlbum();
    const bobs = kit.seed({ n: 7, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [bobs], kit.bob);
    expect(kit.store.driveAlbums.contributions.contributedBy(albumId, [bobs]).get(bobs)).toBe(
      kit.bob.profileId,
    );
    expect(kit.activity.page(kit.alice, albumId, undefined).items).toMatchObject([
      { kind: 'added', itemId: bobs, profileId: kit.bob.profileId },
    ]);
    expect(kit.notices).toMatchObject([{ type: 'photos_activity', albumId, kind: 'added' }]);
  });

  it('cannot add what belongs to someone else, even if they can read it', () => {
    const { albumId, mine } = sharedAlbum();
    expect(() => kit.albums.addItems(albumId, [mine], kit.bob)).toThrow(DriveAlbumItemError);
  });

  it('keep viewers from adding and everyone but the owner from changing the album', () => {
    const { albumId } = sharedAlbum();
    const carols = kit.seed({ n: 8, takenAt: taken, root: kit.carolRoot });
    expect(() => kit.albums.addItems(albumId, [carols], kit.carol)).toThrow(DriveAlbumAccessError);
    expect(() => kit.albums.rename(albumId, 'Mine now', kit.bob)).toThrow(DriveAlbumAccessError);
    expect(() => {
      kit.albums.remove(albumId, kit.bob);
    }).toThrow(DriveAlbumAccessError);
    expect(kit.albums.get(albumId, kit.carol).title).toBe('Holiday');
    expect(kit.albums.list(kit.carol, 'photos').map((album) => album.id)).toEqual([albumId]);
  });

  it('remove only the photos they added, while the owner removes any', () => {
    const { albumId, mine } = sharedAlbum();
    const bobs = kit.seed({ n: 7, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [bobs], kit.bob);
    expect(() => kit.albums.removeItems(albumId, [mine], kit.bob)).toThrow(DriveAlbumAccessError);
    kit.albums.removeItems(albumId, [bobs], kit.bob);
    kit.albums.addItems(albumId, [bobs], kit.bob);
    kit.albums.removeItems(albumId, [bobs, mine], kit.alice);
    expect(kit.store.driveAlbums.members(albumId, null, 10).members).toEqual([]);
  });

  it('cannot put photos of another person into an album that has members', () => {
    const { albumId } = sharedAlbum();
    const bobs = kit.seed({ n: 7, takenAt: taken, root: kit.bobRoot });
    kit.store.driveGrants.set(
      { itemId: bobs, profileId: kit.alice.profileId, role: 'view', expiresAt: null },
      kit.bob.profileId,
    );
    expect(() => kit.albums.addItems(albumId, [bobs], kit.alice)).toThrow(DriveAlbumItemError);
  });
});
