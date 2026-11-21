import { randomUUID } from 'node:crypto';
import type { PartnerShare } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { float32Bytes } from '../../../src/photos/ai/vectors';
import { libraryVisible, photoVisible } from '../../../src/photos/membership';
import { openKit, type Kit } from './fixture';

let kit: Kit;
const late = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
});
afterEach(async () => {
  await kit.test.close();
});

function offer(
  extra: { scope?: 'all' | 'people'; groupIds?: readonly string[]; fromDay?: string } = {},
): PartnerShare {
  return kit.partners.set(kit.alice, {
    recipientId: kit.bob.profileId,
    scope: extra.scope ?? 'all',
    groupIds: extra.groupIds ?? [],
    fromDay: extra.fromDay ?? '2026-01-01',
  });
}

function person(itemIds: readonly string[], owner = kit.alice): string {
  const group = kit.store.photoGroups.insert({
    id: randomUUID(),
    profileId: owner.profileId,
    kind: 'person',
    species: null,
    name: 'Sam',
    coverFaceId: null,
  });
  const faceIds = itemIds.map((itemId) => {
    const id = randomUUID();
    kit.store.photoFaces.replaceKindForItem(itemId, 'person', [
      {
        id,
        itemId,
        rev: 1,
        kind: 'person',
        species: null,
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: null,
        score: 0.9,
        quality: 0.8,
        model: 'sface',
        vector: float32Bytes(new Float32Array(16)),
      },
    ]);
    return id;
  });
  kit.store.photoGroups.assign(group.id, faceIds, 'auto');
  return group.id;
}

describe('partner offer', () => {
  it('shows nothing until the partner accepts, then every photo from the start day', () => {
    const before = kit.seed({ n: 1, takenAt: '2025-12-01T10:00:00.000Z', root: kit.aliceRoot });
    const fresh = kit.seed({ n: 2, takenAt: late, root: kit.aliceRoot });
    const share = offer();
    expect(share).toMatchObject({ state: 'offered', autoSave: false, scope: 'all' });
    expect(kit.shown(photoVisible(kit.bob))).toEqual([]);
    expect(kit.partners.accept(kit.bob, share.id).state).toBe('accepted');
    expect(kit.shown(photoVisible(kit.bob))).toEqual([fresh]);
    expect(kit.shown(photoVisible(kit.bob))).not.toContain(before);
  });

  it('changes an open offer instead of making a second one', () => {
    const first = offer();
    const second = offer({ fromDay: '2026-02-15' });
    expect(second.id).toBe(first.id);
    expect(second.fromDay).toBe('2026-02-15');
  });

  it('refuses sharing with oneself, with nobody, and with people that are not the sharer own', () => {
    expect(() =>
      kit.partners.set(kit.alice, {
        recipientId: kit.alice.profileId,
        scope: 'all',
        groupIds: [],
        fromDay: '2026-01-01',
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    expect(() =>
      kit.partners.set(kit.alice, {
        recipientId: '0f000000-0000-4000-8000-00000000ffff',
        scope: 'all',
        groupIds: [],
        fromDay: '2026-01-01',
      }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
    const bobsGroup = person([kit.seed({ n: 1, takenAt: late, root: kit.bobRoot })], kit.bob);
    expect(() => offer({ scope: 'people', groupIds: [bobsGroup] })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('lets only the offered person accept and either side stop', () => {
    const share = offer();
    expect(() => kit.partners.accept(kit.alice, share.id)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => kit.partners.accept(kit.carol, share.id)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => kit.partners.stop(kit.carol, share.id)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    kit.partners.accept(kit.bob, share.id);
    expect(kit.partners.stop(kit.bob, share.id).state).toBe('stopped');
    expect(kit.partners.stop(kit.alice, share.id).state).toBe('stopped');
    expect(() => kit.partners.accept(kit.bob, share.id)).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
    expect(offer().id).not.toBe(share.id);
  });

  it('follows the sharer groups for chosen people', () => {
    const withSam = kit.seed({ n: 1, takenAt: late, root: kit.aliceRoot });
    const without = kit.seed({ n: 2, takenAt: late, root: kit.aliceRoot });
    const group = person([withSam]);
    const share = offer({ scope: 'people', groupIds: [group] });
    kit.partners.accept(kit.bob, share.id);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([withSam]);
    const added = kit.seed({ n: 3, takenAt: late, root: kit.aliceRoot });
    expect(kit.shown(photoVisible(kit.bob))).not.toContain(added);
    expect(kit.shown(photoVisible(kit.bob))).not.toContain(without);
    kit.store.photoGroups.assign(group, [], 'auto');
    const faceId = randomUUID();
    kit.store.photoFaces.replaceKindForItem(added, 'person', [
      {
        id: faceId,
        itemId: added,
        rev: 1,
        kind: 'person',
        species: null,
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: null,
        score: 0.9,
        quality: 0.8,
        model: 'sface',
        vector: float32Bytes(new Float32Array(16)),
      },
    ]);
    kit.store.photoGroups.assign(group, [faceId], 'auto');
    expect(kit.shown(photoVisible(kit.bob))).toEqual([withSam, added]);
  });

  it('keeps photos the sharer archived out of the partner library', () => {
    const id = kit.seed({ n: 1, takenAt: late, root: kit.aliceRoot });
    kit.partners.accept(kit.bob, offer().id);
    kit.store.photoArchive.archive(kit.alice.profileId, [id]);
    expect(kit.shown(libraryVisible(kit.bob))).toEqual([]);
  });
});

describe('save to my library', () => {
  it('keeps the photos after the partnership ends, without copying files', () => {
    const one = kit.seed({ n: 1, takenAt: late, root: kit.aliceRoot });
    const two = kit.seed({ n: 2, takenAt: late, root: kit.aliceRoot });
    const share = offer();
    kit.partners.accept(kit.bob, share.id);
    expect(kit.partners.save(kit.bob, share.id, { itemIds: [one] })).toEqual({ saved: 1 });
    expect(kit.partners.save(kit.bob, share.id, { itemIds: [one, two] })).toEqual({ saved: 1 });
    kit.partners.stop(kit.alice, share.id);
    expect(kit.shown(photoVisible(kit.bob))).toEqual([one, two]);
    expect(kit.store.driveItems.byId(one, null).rootId).toBe(kit.aliceRoot);
    const albums = kit.store.driveAlbums.listVisibleTo(kit.bob.profileId, 'photos');
    expect(albums).toMatchObject([{ title: 'From Alice', ownerProfileId: kit.bob.profileId }]);
    expect(kit.shown(photoVisible(kit.alice))).toEqual([one, two]);
  });

  it('refuses photos the partner does not share and people who are not the recipient', () => {
    const old = kit.seed({ n: 1, takenAt: '2025-01-01T10:00:00.000Z', root: kit.aliceRoot });
    const own = kit.seed({ n: 2, takenAt: late, root: kit.bobRoot });
    const share = offer();
    expect(() => kit.partners.save(kit.bob, share.id, { itemIds: [old] })).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
    kit.partners.accept(kit.bob, share.id);
    expect(() => kit.partners.save(kit.bob, share.id, { itemIds: [old] })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => kit.partners.save(kit.bob, share.id, { itemIds: [own] })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => kit.partners.save(kit.alice, share.id, { itemIds: [old] })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('does not let a saved partner photo into an album that is then shared', () => {
    const one = kit.seed({ n: 1, takenAt: late, root: kit.aliceRoot });
    const share = offer();
    kit.partners.accept(kit.bob, share.id);
    kit.partners.save(kit.bob, share.id, { itemIds: [one] });
    const saved = kit.store.driveAlbums.listVisibleTo(kit.bob.profileId, 'photos')[0];
    expect(() =>
      kit.members.set(kit.bob, saved?.id ?? '', {
        members: [{ profileId: kit.carol.profileId, role: 'viewer' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });
});

describe('auto-save', () => {
  it('saves what is already shared when turned on and every new photo after', () => {
    const one = kit.seed({ n: 1, takenAt: late, root: kit.aliceRoot });
    const share = offer();
    kit.partners.accept(kit.bob, share.id);
    expect(kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true }).autoSave).toBe(true);
    const albumOf = (): readonly string[] =>
      kit.store.driveAlbums
        .listVisibleTo(kit.bob.profileId, 'photos')
        .flatMap((album) => kit.store.driveAlbums.members(album.id, null, 50).members)
        .map((member) => member.itemId);
    expect(albumOf()).toEqual([one]);
    const two = kit.seed({ n: 2, takenAt: late, root: kit.aliceRoot });
    expect(kit.auto.reconcile()).toBe(1);
    expect(albumOf()).toEqual([one, two]);
    expect(kit.auto.reconcile()).toBe(0);
  });

  it('runs when the drive or the photo analysis announces a change, once per burst', () => {
    const share = offer();
    kit.partners.accept(kit.bob, share.id);
    kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true });
    kit.trigger.start();
    const fresh = kit.seed({ n: 5, takenAt: late, root: kit.aliceRoot });
    kit.store.feed.notice({
      type: 'drive_changed',
      rootIds: [kit.aliceRoot],
      folderIds: [],
      albumIds: [],
      months: ['2026-03'],
      cursor: 1,
    });
    kit.store.feed.notice({ type: 'photos_ai', stage: 'faces', done: 1, total: 1 });
    expect(kit.deferred).toHaveLength(1);
    kit.deferred.shift()?.();
    const saved = kit.store.driveAlbums
      .listVisibleTo(kit.bob.profileId, 'photos')
      .flatMap((album) => kit.store.driveAlbums.members(album.id, null, 50).members);
    expect(saved.map((member) => member.itemId)).toEqual([fresh]);
    kit.trigger.stop();
    kit.store.feed.notice({ type: 'photos_ai', stage: 'faces', done: 1, total: 1 });
    expect(kit.deferred).toHaveLength(0);
  });

  it('stops with the partnership and needs an accepted share', () => {
    const share = offer();
    expect(() => kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true })).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
    kit.partners.accept(kit.bob, share.id);
    kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true });
    expect(kit.partners.stop(kit.bob, share.id)).toMatchObject({
      state: 'stopped',
      autoSave: false,
    });
  });

  it('lists the offers on both sides', () => {
    const share = offer();
    expect(kit.reader.read(kit.alice).partners).toMatchObject([{ id: share.id }]);
    expect(kit.reader.read(kit.bob).partners).toMatchObject([{ id: share.id, state: 'offered' }]);
    kit.partners.stop(kit.alice, share.id);
    expect(kit.reader.read(kit.bob).partners).toEqual([]);
  });
});
