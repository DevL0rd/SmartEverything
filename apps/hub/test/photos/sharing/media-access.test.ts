import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../../src/drive/access';
import { driveFileLink, readableItem, type DriveFiles } from '../../../src/server/drive-files';
import { MediaLinks } from '../../../src/server/media-links';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let files: DriveFiles;
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
  files = {
    store: kit.store,
    links: new MediaLinks(() => kit.time.current),
    nodes: {
      authenticate: (): never => {
        throw new Error('The test has no computer nodes.');
      },
      actorOf: (): DriveActor => kit.alice,
    },
    now: (): Date => kit.time.current,
  };
});
afterEach(async () => {
  await kit.test.close();
});

function reads(actor: DriveActor, itemId: string): boolean {
  try {
    driveFileLink(files, actor, itemId);
    return readableItem(files, actor, itemId).access === 'view';
  } catch (cause) {
    expect(cause).toMatchObject({ code: 'not_found' });
    return false;
  }
}

describe('photo bytes for album members and partners', () => {
  it('lets members open the owner photos and contributed photos of a shared album', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.members.set(kit.alice, albumId, {
      members: [
        { profileId: kit.bob.profileId, role: 'contributor' },
        { profileId: kit.carol.profileId, role: 'viewer' },
      ],
    });
    const bobs = kit.seed({ n: 2, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [bobs], kit.bob);
    expect(reads(kit.bob, mine)).toBe(true);
    expect(reads(kit.carol, mine)).toBe(true);
    expect(reads(kit.carol, bobs)).toBe(true);
    expect(reads(kit.alice, bobs)).toBe(true);
  });

  it('keeps an unshared photo and a removed member refused', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const unshared = kit.seed({ n: 2, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(reads(kit.bob, unshared)).toBe(false);
    expect(reads(kit.carol, mine)).toBe(false);
    kit.members.remove(kit.alice, albumId, kit.bob.profileId);
    expect(reads(kit.bob, mine)).toBe(false);
  });

  it('lets an accepted partner open the shared photos', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    expect(reads(kit.bob, mine)).toBe(false);
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    expect(reads(kit.bob, mine)).toBe(false);
    kit.partners.accept(kit.bob, share.id);
    expect(reads(kit.bob, mine)).toBe(true);
  });

  it('never opens a Locked folder photo through an album', () => {
    const hidden = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot, name: '.locked/1.jpg' });
    const albumId = kit.album(kit.alice, [hidden]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(reads(kit.bob, hidden)).toBe(false);
    expect(reads(kit.alice, hidden)).toBe(false);
  });
});
