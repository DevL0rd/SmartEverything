import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveShares, type ShareActor, type ShareOrigin } from '../../../src/drive/shares';
import { photoVisible } from '../../../src/photos/membership';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let shares: DriveShares;
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
  shares = new DriveShares({
    store: kit.store,
    origin: (): ShareOrigin => ({ url: 'http://hub.local:8080', public: false }),
    now: (): Date => kit.time.current,
  });
});
afterEach(async () => {
  await kit.test.close();
});

function actor(profileId: string): ShareActor {
  return { profileId, owner: true };
}

function link(albumId: string): Promise<unknown> {
  return shares.create(actor(kit.alice.profileId), {
    albumId,
    permission: 'view',
    expiresAt: null,
    password: null,
  });
}

describe('album exposure', () => {
  it('links an album that holds only what its owner may share', async () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    await expect(link(albumId)).resolves.toBeDefined();
    expect(kit.store.driveAlbums.contributions.exposes(albumId, mine)).toBe(true);
  });

  it('refuses a link for an album that holds a photo someone else owns', async () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const theirs = kit.seed({ n: 2, takenAt: taken, root: kit.bobRoot });
    const albumId = kit.album(kit.alice, [mine, theirs]);
    await expect(link(albumId)).rejects.toMatchObject({ code: 'invalid_request' });
    expect(kit.store.driveAlbums.contributions.exposes(albumId, theirs)).toBe(false);
    expect(kit.store.driveAlbums.contributions.exposes(albumId, mine)).toBe(true);
  });

  it('refuses a link for an album a saved partner photo sits in, and keeps it visible to its owner', async () => {
    const one = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    kit.partners.accept(kit.bob, share.id);
    kit.partners.save(kit.bob, share.id, { itemIds: [one] });
    const saved = kit.store.driveAlbums.listVisibleTo(kit.bob.profileId, 'photos')[0]?.id ?? '';
    await expect(
      shares.create(actor(kit.bob.profileId), {
        albumId: saved,
        permission: 'view',
        expiresAt: null,
        password: null,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    kit.partners.stop(kit.alice, share.id);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([one]);
  });

  it('does not keep a foreign photo visible to the album owner', () => {
    const theirs = kit.seed({ n: 2, takenAt: taken, root: kit.bobRoot });
    kit.album(kit.alice, [theirs]);
    expect(kit.shown(photoVisible(kit.alice))).toEqual([]);
  });

  it('shows members a contributed photo of their own and not a foreign one', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    const bobs = kit.seed({ n: 2, takenAt: taken, root: kit.bobRoot });
    const carols = kit.seed({ n: 3, takenAt: taken, root: kit.carolRoot });
    kit.store.driveAlbums.addItems(albumId, [bobs], kit.bob.profileId);
    kit.store.driveAlbums.addItems(albumId, [carols], kit.bob.profileId);
    expect(kit.shown(photoVisible(kit.alice))).toEqual(expect.arrayContaining([mine, bobs]));
    expect(kit.shown(photoVisible(kit.alice))).not.toContain(carols);
    expect(kit.shown(photoVisible(kit.bob))).not.toContain(carols);
  });
});
