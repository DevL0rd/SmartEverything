import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { photoVisible } from '../../../src/photos/membership';
import { openKit, type Kit } from './fixture';

let kit: Kit;
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
});
afterEach(async () => {
  await kit.test.close();
});

function shared(): { readonly albumId: string; readonly mine: string } {
  const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
  return { albumId: kit.album(kit.alice, [mine]), mine };
}

describe('album members', () => {
  it('lets invited people see the album photos and nothing else of the owner', () => {
    const { albumId, mine } = shared();
    const other = kit.seed({ n: 2, takenAt: taken, root: kit.aliceRoot });
    expect(kit.shown(photoVisible(kit.bob))).toEqual([]);
    const members = kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(members).toMatchObject([
      { profileId: kit.bob.profileId, role: 'viewer', joinedAt: null },
    ]);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([mine]);
    expect(kit.shown(photoVisible(kit.bob))).not.toContain(other);
  });

  it('changes the role of someone already invited', () => {
    const { albumId } = shared();
    const bob = kit.bob.profileId;
    kit.members.set(kit.alice, albumId, { members: [{ profileId: bob, role: 'viewer' }] });
    const changed = kit.members.set(kit.alice, albumId, {
      members: [{ profileId: bob, role: 'contributor' }],
    });
    expect(changed).toMatchObject([{ profileId: bob, role: 'contributor' }]);
  });

  it('lets only the person who made the album decide who is in it', () => {
    const { albumId } = shared();
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    const invite = { members: [{ profileId: kit.carol.profileId, role: 'viewer' as const }] };
    expect(() => kit.members.set(kit.bob, albumId, invite)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => kit.members.set(kit.carol, albumId, invite)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => {
      kit.members.remove(kit.bob, albumId, kit.carol.profileId);
    }).toThrow(expect.objectContaining({ code: 'forbidden' }));
  });

  it('refuses the owner, unknown people and albums that hold other people photos', () => {
    const { albumId } = shared();
    expect(() =>
      kit.members.set(kit.alice, albumId, {
        members: [{ profileId: kit.alice.profileId, role: 'viewer' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    expect(() =>
      kit.members.set(kit.alice, albumId, {
        members: [{ profileId: '0f000000-0000-4000-8000-00000000ffff', role: 'viewer' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
    const bobs = kit.seed({ n: 3, takenAt: taken, root: kit.bobRoot });
    kit.store.driveAlbums.addItems(albumId, [bobs], kit.alice.profileId);
    expect(() =>
      kit.members.set(kit.alice, albumId, {
        members: [{ profileId: kit.carol.profileId, role: 'viewer' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('does not share home albums or smart albums', () => {
    const smart = kit.store.driveAlbums.insert({
      id: '0a000000-0000-4000-8000-000000000001',
      title: 'Rule',
      kind: 'smart',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: kit.alice.profileId,
      coverItemId: null,
      rule: { match: 'all', rules: [{ kind: 'starred', starred: true }] },
    });
    expect(() =>
      kit.members.set(kit.alice, smart.id, {
        members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('records a join once and tells live pages', () => {
    const { albumId } = shared();
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    kit.notices.length = 0;
    const joined = kit.members.join(kit.bob, albumId);
    expect(joined.joinedAt).not.toBeNull();
    kit.members.join(kit.bob, albumId);
    const page = kit.activity.page(kit.alice, albumId, undefined);
    expect(page.items.filter((entry) => entry.kind === 'joined')).toHaveLength(1);
    expect(kit.notices).toMatchObject([{ type: 'photos_activity', albumId, kind: 'joined' }]);
    expect(() => kit.members.join(kit.alice, albumId)).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
    expect(() => kit.members.join(kit.carol, albumId)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('takes a leaving contributor photos, comments and access with them', () => {
    const { albumId, mine } = shared();
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    const bobs = kit.seed({ n: 4, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [bobs], kit.bob);
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'Lovely' });
    kit.members.leave(kit.bob, albumId);
    expect(kit.store.driveAlbums.members(albumId, null, 10).members.map((m) => m.itemId)).toEqual([
      mine,
    ]);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([bobs]);
    const page = kit.activity.page(kit.alice, albumId, undefined);
    expect(page.items.map((entry) => entry.kind)).toEqual(['left']);
    expect(() => kit.activity.page(kit.bob, albumId, undefined)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('keeps the owner in the album', () => {
    const { albumId } = shared();
    expect(() => {
      kit.members.leave(kit.alice, albumId);
    }).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => {
      kit.members.remove(kit.alice, albumId, kit.alice.profileId);
    }).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('makes a removed member lose access and their contributed photos', () => {
    const { albumId, mine } = shared();
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    const bobs = kit.seed({ n: 5, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [bobs], kit.bob);
    kit.activity.add(kit.bob, albumId, { kind: 'like' });
    kit.notices.length = 0;
    kit.members.remove(kit.alice, albumId, kit.bob.profileId);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([bobs]);
    expect(kit.store.driveAlbums.members(albumId, null, 10).members).toHaveLength(1);
    expect(kit.store.driveAlbums.members(albumId, null, 10).members[0]?.itemId).toBe(mine);
    expect(kit.activity.page(kit.alice, albumId, undefined).items).toEqual([]);
    expect(kit.notices).toMatchObject([{ type: 'photos_activity', albumId, kind: 'left' }]);
    expect(kit.store.photoAlbumMembers.find(albumId, kit.bob.profileId)).toBeUndefined();
  });
});
