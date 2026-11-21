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
      actorOf: (): Promise<DriveActor> => Promise.resolve(kit.alice),
    },
    now: (): Date => kit.time.current,
  };
});
afterEach(async () => {
  await kit.test.close();
});

async function reads(actor: DriveActor, itemId: string): Promise<boolean> {
  try {
    await driveFileLink(files, actor, itemId);
    return (await readableItem(files, actor, itemId)).access === 'view';
  } catch (cause) {
    expect(cause).toMatchObject({ code: 'not_found' });
    return false;
  }
}

describe('photo bytes for album members and partners', () => {
  it('lets members open the owner photos and contributed photos of a shared album', async () => {
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
    expect(await reads(kit.bob, mine)).toBe(true);
    expect(await reads(kit.carol, mine)).toBe(true);
    expect(await reads(kit.carol, bobs)).toBe(true);
    expect(await reads(kit.alice, bobs)).toBe(true);
  });

  it('keeps an unshared photo and a removed member refused', async () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const unshared = kit.seed({ n: 2, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(await reads(kit.bob, unshared)).toBe(false);
    expect(await reads(kit.carol, mine)).toBe(false);
    kit.members.remove(kit.alice, albumId, kit.bob.profileId);
    expect(await reads(kit.bob, mine)).toBe(false);
  });

  it('lets an accepted partner open the shared photos', async () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    expect(await reads(kit.bob, mine)).toBe(false);
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    expect(await reads(kit.bob, mine)).toBe(false);
    kit.partners.accept(kit.bob, share.id);
    expect(await reads(kit.bob, mine)).toBe(true);
  });

  it('never opens a Locked folder photo through an album', async () => {
    const hidden = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot, name: '.locked/1.jpg' });
    const albumId = kit.album(kit.alice, [hidden]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(await reads(kit.bob, hidden)).toBe(false);
    expect(await reads(kit.alice, hidden)).toBe(false);
  });
});
