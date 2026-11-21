import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../src/drive/shares';
import { LockedLinks, verifyLockedLink } from '../../../src/photos/organise/locked-links';
import { MediaLinks } from '../../../src/server/media-links';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let links: MediaLinks;
let locked: LockedLinks;
const taken = '2026-03-01T10:00:00.000Z';
const session = hashToken('token');

beforeEach(async () => {
  kit = await openKit();
  links = new MediaLinks(() => kit.time.current);
  locked = new LockedLinks(kit.store.host, links);
  kit.store.photoLocked.issue(session, kit.alice.profileId, kit.phone, '2026-10-08T10:10:00.000Z');
});
afterEach(async () => {
  await kit.test.close();
});

function seedLocked(n: number, root = kit.aliceRoot): string {
  const id = kit.seed({ n, takenAt: taken, root, name: `.locked/${String(n)}.jpg` });
  kit.store.context.sql.run(
    'mark the thumb ready',
    `update drive_items set thumb_state = 'ready' where id = $id`,
    {
      id,
    },
  );
  return id;
}

function urlOf(link: { readonly url: string } | null): URL {
  if (link === null) throw new Error('The link is missing.');
  return new URL(link.url, 'http://hub.local');
}

describe('links to photos in the Locked folder', () => {
  it('signs file and thumb links bound to the open session', async () => {
    const id = seedLocked(1);
    const [link] = await locked.mint(kit.alice.profileId, session, { itemIds: [id] });
    expect(link).toMatchObject({ itemId: id, download: null, icon: null, playable: null });
    for (const url of [urlOf(link?.file ?? null), urlOf(link?.thumb ?? null)]) {
      const target = await verifyLockedLink(kit.store.host, links, url, id);
      expect(target.item.id).toBe(id);
      expect(target.link).toMatchObject({ rev: target.item.rev, download: false });
    }
  });

  it('refuses photos outside the caller Locked folder', async () => {
    const open = kit.seed({ n: 2, takenAt: taken, root: kit.aliceRoot, name: 'Photos/2.jpg' });
    const theirs = seedLocked(3, kit.bobRoot);
    for (const itemId of [open, theirs]) {
      await expect(
        locked.mint(kit.alice.profileId, session, { itemIds: [itemId] }),
      ).rejects.toThrow(expect.objectContaining({ code: 'not_found' }));
    }
  });

  it('stops serving once the folder locks', async () => {
    const id = seedLocked(1);
    const [link] = await locked.mint(kit.alice.profileId, session, { itemIds: [id] });
    kit.store.photoLocked.lock(kit.alice.profileId, kit.phone);
    await expect(
      verifyLockedLink(kit.store.host, links, urlOf(link?.thumb ?? null), id),
    ).rejects.toThrow(expect.objectContaining({ code: 'link_expired' }));
  });

  it('refuses a changed link, another path and another photo', async () => {
    const id = seedLocked(1);
    const other = seedLocked(2);
    const [link] = await locked.mint(kit.alice.profileId, session, { itemIds: [id] });
    const thumb = urlOf(link?.thumb ?? null);
    const widened = new URL(thumb);
    widened.searchParams.set('download', '1');
    const moved = new URL(thumb);
    moved.pathname = moved.pathname.replace('/thumb', '/preview');
    const swapped = new URL(thumb);
    swapped.pathname = swapped.pathname.replace(id, other);
    for (const url of [widened, moved]) {
      await expect(verifyLockedLink(kit.store.host, links, url, id)).rejects.toThrow(
        expect.objectContaining({ code: 'unauthorized' }),
      );
    }
    await expect(verifyLockedLink(kit.store.host, links, swapped, other)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthorized' }),
    );
  });

  it('never accepts an ordinary drive link as a Locked folder link', async () => {
    const id = seedLocked(1);
    const plain = urlOf(links.driveThumb(id, 'thumb', 1));
    plain.searchParams.set('locked', session);
    await expect(verifyLockedLink(kit.store.host, links, plain, id)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthorized' }),
    );
  });
});
