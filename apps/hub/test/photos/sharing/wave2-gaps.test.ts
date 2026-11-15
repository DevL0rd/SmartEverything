import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { albumAudience, invitePush } from '../../../src/extensions/push/album-activity';
import { testLogger } from '../../support/logs';
import { openKit, type Kit } from './fixture';

let kit: Kit;
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
});
afterEach(async () => {
  await kit.test.close();
});

function savedItems(): readonly string[] {
  return kit.store.driveAlbums
    .listVisibleTo(kit.bob.profileId, 'photos')
    .flatMap((album) => kit.store.driveAlbums.members(album.id, null, 50).members)
    .map((member) => member.itemId);
}

function savedAlbum(): string {
  const [album] = kit.store.driveAlbums.listVisibleTo(kit.bob.profileId, 'photos');
  if (album === undefined) throw new Error('the saved album is missing');
  return album.id;
}

describe('invitations', () => {
  it('tell only the invited person, once per person newly invited', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.notices.length = 0;
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    expect(kit.notices).toEqual([
      { type: 'photos_activity', albumId, kind: 'joined' },
      { type: 'photos_activity', albumId, kind: 'invited', profileId: kit.bob.profileId },
    ]);
    kit.notices.length = 0;
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    expect(kit.notices).toEqual([{ type: 'photos_activity', albumId, kind: 'joined' }]);
  });

  it('push the invitee with who invited them and respect the album pref', () => {
    const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const albumId = kit.album(kit.alice, [mine]);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'viewer' }],
    });
    kit.store.clients.useProfile(kit.phone, kit.bob.profileId);
    kit.store.clients.useProfile(kit.tablet, kit.carol.profileId);
    const push = invitePush(kit.store, albumId, kit.bob.profileId);
    expect(push?.notification).toMatchObject({
      title: 'Shared album',
      body: 'Alice invited you to Holiday',
      data: { kind: 'photos_activity', albumId, activityKind: 'invited' },
    });
    expect([...(push?.recipients ?? [])]).toEqual([kit.bob.profileId]);
    const audience = albumAudience(kit.store, push?.recipients ?? new Set(), testLogger());
    expect(audience(kit.phone)).toBe(true);
    expect(audience(kit.tablet)).toBe(false);
    expect(invitePush(kit.store, albumId, kit.carol.profileId)).toBeNull();
  });
});

describe('partner notices', () => {
  it('reach both people on an offer, an accept and a stop', () => {
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    const heard = (state: string): unknown => ({
      type: 'photos_partner',
      shareId: share.id,
      sharerId: kit.alice.profileId,
      recipientId: kit.bob.profileId,
      state,
    });
    expect(kit.notices).toContainEqual(heard('offered'));
    kit.notices.length = 0;
    kit.partners.accept(kit.bob, share.id);
    expect(kit.notices).toEqual([heard('accepted')]);
    kit.partners.accept(kit.bob, share.id);
    expect(kit.notices).toEqual([heard('accepted')]);
    kit.notices.length = 0;
    kit.partners.stop(kit.alice, share.id);
    expect(kit.notices).toEqual([heard('stopped')]);
    kit.partners.stop(kit.alice, share.id);
    expect(kit.notices).toEqual([heard('stopped')]);
  });
});

describe('auto-save after the recipient removed a photo', () => {
  it('does not bring the photo back, while new photos still arrive', () => {
    const one = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    kit.partners.accept(kit.bob, share.id);
    kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true });
    expect(savedItems()).toEqual([one]);
    kit.store.driveAlbums.removeItems(savedAlbum(), [one]);
    expect(savedItems()).toEqual([]);
    expect(kit.auto.reconcile()).toBe(0);
    expect(savedItems()).toEqual([]);
    const two = kit.seed({ n: 2, takenAt: taken, root: kit.aliceRoot });
    expect(kit.auto.reconcile()).toBe(1);
    expect(savedItems()).toEqual([two]);
  });

  it('still lets the recipient save the removed photo again on purpose', () => {
    const one = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
    const share = kit.partners.set(kit.alice, {
      recipientId: kit.bob.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    kit.partners.accept(kit.bob, share.id);
    kit.partners.setAutoSave(kit.bob, share.id, { autoSave: true });
    kit.store.driveAlbums.removeItems(savedAlbum(), [one]);
    expect(kit.partners.save(kit.bob, share.id, { itemIds: [one] })).toEqual({ saved: 1 });
    expect(savedItems()).toEqual([one]);
  });
});
