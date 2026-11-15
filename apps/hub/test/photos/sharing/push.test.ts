import { CLIENT_PREFS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { albumAudience, albumPushes } from '../../../src/extensions/push/album-activity';
import { ActivityTail } from '../../../src/photos/sharing/tail';
import { testLogger } from '../../support/logs';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let tail: ActivityTail;
let albumId = '';
const taken = '2026-03-01T10:00:00.000Z';

beforeEach(async () => {
  kit = await openKit();
  const mine = kit.seed({ n: 1, takenAt: taken, root: kit.aliceRoot });
  albumId = kit.album(kit.alice, [mine]);
  kit.members.set(kit.alice, albumId, {
    members: [
      { profileId: kit.bob.profileId, role: 'contributor' },
      { profileId: kit.carol.profileId, role: 'viewer' },
    ],
  });
  kit.store.photoAlbumMembers.join(albumId, kit.bob.profileId);
  kit.store.photoAlbumMembers.join(albumId, kit.carol.profileId);
  kit.store.clients.useProfile(kit.phone, kit.bob.profileId);
  kit.store.clients.useProfile(kit.tablet, kit.carol.profileId);
  kit.time.current = new Date('2026-10-08T11:00:00.000Z');
  tail = new ActivityTail(kit.store);
});
afterEach(async () => {
  await kit.test.close();
});

function next(): ReturnType<typeof albumPushes> {
  return albumPushes(kit.store, tail.drain());
}

describe('the activity tail', () => {
  it('hands each new row over once, even when several share a moment', () => {
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'one' });
    kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'two' });
    const both = tail.drain().map((row) => row.text);
    expect(both).toHaveLength(2);
    expect(both).toEqual(expect.arrayContaining(['one', 'two']));
    expect(tail.drain()).toEqual([]);
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'three' });
    expect(tail.drain().map((row) => row.text)).toEqual(['three']);
  });

  it('skips what happened before it started', () => {
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'old' });
    const started = new ActivityTail(kit.store);
    expect(started.drain()).toEqual([]);
    kit.activity.add(kit.bob, albumId, { kind: 'comment', text: 'new' });
    expect(started.drain().map((row) => row.text)).toEqual(['new']);
  });
});

describe('album activity pushes', () => {
  it('says who added how many photos, to the other members and never the actor', () => {
    const a = kit.seed({ n: 2, takenAt: taken, root: kit.bobRoot });
    const b = kit.seed({ n: 3, takenAt: taken, root: kit.bobRoot });
    kit.albums.addItems(albumId, [a, b], kit.bob);
    const [push, ...rest] = next();
    expect(rest).toEqual([]);
    expect(push?.notification.body).toBe('Bob added 2 photos to Holiday');
    expect(push?.notification.data).toMatchObject({ kind: 'photos_activity', albumId });
    expect([...(push?.recipients ?? [])].sort()).toEqual(
      [kit.alice.profileId, kit.carol.profileId].sort(),
    );
  });

  it('words comments, likes and joins and stays quiet about leaving', () => {
    kit.activity.add(kit.carol, albumId, { kind: 'comment', text: 'Great trip' });
    kit.activity.add(kit.carol, albumId, { kind: 'like' });
    const bodies = next().map((push) => push.notification.body);
    expect(bodies).toHaveLength(2);
    expect(bodies).toEqual(
      expect.arrayContaining([
        'Carol commented on Holiday: Great trip',
        'Carol liked a photo in Holiday',
      ]),
    );
    kit.members.leave(kit.bob, albumId);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.bob.profileId, role: 'contributor' }],
    });
    kit.members.join(kit.bob, albumId);
    kit.members.leave(kit.carol, albumId);
    expect(next().map((push) => push.notification.body)).toEqual(['Bob joined Holiday']);
  });

  it('does not reach a person who was invited and has not joined', () => {
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.carol.profileId, role: 'viewer' }],
    });
    kit.store.photoAlbumMembers.remove(albumId, kit.carol.profileId);
    kit.members.set(kit.alice, albumId, {
      members: [{ profileId: kit.carol.profileId, role: 'viewer' }],
    });
    kit.activity.add(kit.alice, albumId, { kind: 'comment', text: 'Hello' });
    const [push] = next();
    expect([...(push?.recipients ?? [])]).toEqual([kit.bob.profileId]);
  });

  it('reaches the phone of a member who has the setting on and not one who turned it off', () => {
    kit.activity.add(kit.alice, albumId, { kind: 'comment', text: 'Hello' });
    const [push] = next();
    const audience = albumAudience(kit.store, push?.recipients ?? new Set(), testLogger('push'));
    expect(audience(kit.phone)).toBe(true);
    expect(audience(kit.tablet)).toBe(true);
    const defaults = CLIENT_PREFS.photos.defaultValue;
    kit.store.personal.saveLayout(
      { clientId: kit.tablet, profileId: kit.carol.profileId },
      CLIENT_PREFS.photos.storageKey,
      CLIENT_PREFS.photos.encode({ ...defaults, albumActivity: false }),
    );
    expect(audience(kit.tablet)).toBe(false);
    expect(audience(kit.phone)).toBe(true);
  });

  it('does not reach a person outside the album', () => {
    kit.activity.add(kit.alice, albumId, { kind: 'comment', text: 'Hello' });
    const outsider = kit.store.profiles.create({ name: 'Dan' }).id;
    const client = kit.store.clients.create({
      name: 'Laptop',
      platform: 'android',
      role: 'owner',
      tokenHash: 'c'.repeat(64),
    }).id;
    kit.store.clients.useProfile(client, outsider);
    const [push] = next();
    expect(
      albumAudience(kit.store, push?.recipients ?? new Set(), testLogger('push'))(client),
    ).toBe(false);
  });
});
