import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

function commentCount(albumId: string): number {
  return kit.activity
    .page(kit.alice, albumId, undefined)
    .items.filter((entry) => entry.kind === 'comment').length;
}

describe('album comments and likes with an id the client generated', () => {
  it('keeps the client id and returns the same comment when the add is repeated', () => {
    const { albumId } = sharedAlbum();
    const id = randomUUID();
    const first = kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'Great', id });
    const again = kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'Great', id });

    expect(first.id).toBe(id);
    expect(again).toEqual(first);
    expect(commentCount(albumId)).toBe(1);
    expect(kit.notices).toHaveLength(1);
  });

  it('keeps the client id of a like', () => {
    const { albumId, mine } = sharedAlbum();
    const id = randomUUID();
    const like = kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine, id });

    expect(like.id).toBe(id);
    expect(kit.activity.add(kit.bob, albumId, { kind: 'like', itemId: mine, id }).id).toBe(id);
  });

  it('refuses an id that belongs to someone else', () => {
    const { albumId } = sharedAlbum();
    const id = randomUUID();
    kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'Mine', id });

    expect(() =>
      kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'Taken', id }),
    ).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(commentCount(albumId)).toBe(1);
  });
});
