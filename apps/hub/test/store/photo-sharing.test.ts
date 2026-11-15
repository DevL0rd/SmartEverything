import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhotoActivityDraft } from '../../src/store/repositories/photo-album-activity';
import {
  PhotoPartnerScopeError,
  type PhotoPartnerShareRow,
} from '../../src/store/repositories/photo-partner-shares';
import { DriveSharesRepository } from '../../src/store/repositories/drive-shares';
import {
  ALICE_ROOT,
  BOB_ROOT,
  NOW,
  id,
  photo,
  photoFixture,
  type PhotoFixture,
} from './photo-fixture';

let fixture: PhotoFixture;
let album: string;
let mine: string;
let theirs: string;

beforeEach(() => {
  fixture = photoFixture();
  album = fixture.albums.insert({
    id: id('0c', 1),
    title: 'Trip',
    kind: 'manual',
    surface: 'photos',
    scope: 'person',
    ownerProfileId: fixture.alice,
    coverItemId: null,
  }).id;
  mine = photo(fixture.database, { n: 1, root: ALICE_ROOT, inLibrary: true });
  theirs = photo(fixture.database, { n: 2, root: BOB_ROOT, inLibrary: true });
});

afterEach(() => {
  fixture.database.close();
});

describe('album contributions', () => {
  it('records who added each photo and defaults to the album owner', () => {
    fixture.albums.addItems(album, [mine]);
    fixture.albums.addItems(album, [theirs], fixture.bob);
    const members = fixture.albums.members(album, null, 10).members;
    expect(members.map((member) => [member.itemId, member.addedBy])).toEqual([
      [mine, fixture.alice],
      [theirs, fixture.bob],
    ]);
  });

  it('removes only what a person contributed and clears a cover that goes', () => {
    fixture.albums.addItems(album, [mine]);
    fixture.albums.addItems(album, [theirs], fixture.bob);
    fixture.albums.update(album, { coverItemId: theirs });
    const after = fixture.albums.removeContributions(album, fixture.bob);
    expect(after.itemCount).toBe(1);
    expect(after.coverItemId).toBeNull();
    expect(fixture.albums.members(album, null, 10).members.map((member) => member.itemId)).toEqual([
      mine,
    ]);
  });
});

describe('album members', () => {
  it('invites, joins, changes the role and removes', () => {
    const { photoAlbumMembers } = fixture.repos;
    photoAlbumMembers.invite(album, fixture.bob, 'viewer', fixture.alice);
    expect(photoAlbumMembers.find(album, fixture.bob)).toEqual({
      albumId: album,
      profileId: fixture.bob,
      role: 'viewer',
      addedBy: fixture.alice,
      joinedAt: null,
    });
    expect(photoAlbumMembers.join(album, fixture.bob).joinedAt).toBe(NOW);
    photoAlbumMembers.invite(album, fixture.bob, 'contributor', fixture.alice);
    expect(photoAlbumMembers.find(album, fixture.bob)).toMatchObject({
      role: 'contributor',
      joinedAt: NOW,
    });
    photoAlbumMembers.invite(album, fixture.cara, 'viewer', fixture.alice);
    expect(photoAlbumMembers.forAlbum(album)).toHaveLength(2);
    expect(photoAlbumMembers.forProfile(fixture.bob).map((member) => member.albumId)).toEqual([
      album,
    ]);
    expect(photoAlbumMembers.remove(album, fixture.bob)).toBe(true);
    expect(photoAlbumMembers.remove(album, fixture.bob)).toBe(false);
  });

  it('goes with the album', () => {
    fixture.repos.photoAlbumMembers.invite(album, fixture.bob, 'viewer', fixture.alice);
    fixture.albums.remove(album);
    expect(fixture.repos.photoAlbumMembers.forAlbum(album)).toEqual([]);
  });
});

describe('album activity', () => {
  const draft = (
    n: number,
    kind: 'added' | 'comment' | 'like' | 'joined',
    itemId: string | null,
    text: string | null = null,
  ): PhotoActivityDraft => ({
    id: id('0d', n),
    albumId: album,
    itemId,
    profileId: fixture.bob,
    kind,
    text,
  });

  it('records, pages newest first and removes', () => {
    const { photoAlbumActivity } = fixture.repos;
    photoAlbumActivity.add(draft(1, 'added', mine));
    photoAlbumActivity.add(draft(2, 'comment', mine, 'Lovely'));
    photoAlbumActivity.add(draft(3, 'joined', null));
    const firstPage = photoAlbumActivity.page(album, null, 2);
    expect(firstPage.activity.map((row) => row.id)).toEqual([id('0d', 3), id('0d', 2)]);
    expect(firstPage.next).not.toBeNull();
    const secondPage = photoAlbumActivity.page(album, firstPage.next, 2);
    expect(secondPage.activity.map((row) => row.id)).toEqual([id('0d', 1)]);
    expect(secondPage.next).toBeNull();
    expect(photoAlbumActivity.forItem(album, mine)).toHaveLength(2);
    expect(photoAlbumActivity.remove(id('0d', 2))).toBe(true);
    expect(photoAlbumActivity.find(id('0d', 2))).toBeUndefined();
  });

  it('allows one like per person and photo and lets it be undone', () => {
    const { photoAlbumActivity } = fixture.repos;
    expect(photoAlbumActivity.add(draft(1, 'like', mine))).toBeDefined();
    expect(photoAlbumActivity.add(draft(2, 'like', mine))).toBeUndefined();
    expect(photoAlbumActivity.add(draft(3, 'like', null))).toBeDefined();
    expect(photoAlbumActivity.unlike(album, mine, fixture.bob)).toBe(true);
    expect(photoAlbumActivity.unlike(album, mine, fixture.bob)).toBe(false);
    expect(photoAlbumActivity.removeForProfile(album, fixture.bob)).toBe(1);
  });

  it('refuses a comment without text and an add without a photo', () => {
    const { photoAlbumActivity } = fixture.repos;
    expect(() => photoAlbumActivity.add(draft(1, 'comment', mine))).toThrow(/constraint/);
    expect(() => photoAlbumActivity.add(draft(2, 'added', null))).toThrow(/constraint/);
  });
});

describe('partner shares', () => {
  const offer = (n: number, sharerId: string, recipientId: string): PhotoPartnerShareRow =>
    fixture.repos.photoPartnerShares.insert({
      id: id('0e', n),
      sharerId,
      recipientId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });

  it('offers, accepts, changes and stops, with one open share per pair', () => {
    const { photoPartnerShares } = fixture.repos;
    const group = fixture.repos.photoGroups.insert({
      id: id('0f', 1),
      profileId: fixture.alice,
      kind: 'person',
      species: null,
      name: null,
      coverFaceId: null,
    });
    const share = offer(1, fixture.alice, fixture.bob);
    expect(share).toMatchObject({ state: 'offered', autoSave: false, groupIds: [] });
    expect(() => offer(2, fixture.alice, fixture.bob)).toThrow(/constraint/);
    expect(
      photoPartnerShares.update(share.id, { state: 'accepted', autoSave: true }),
    ).toMatchObject({
      state: 'accepted',
      autoSave: true,
    });
    expect(photoPartnerShares.open(fixture.alice, fixture.bob)?.id).toBe(share.id);
    expect(
      photoPartnerShares.update(share.id, {
        scope: 'people',
        groupIds: [group.id],
        fromDay: '2026-03-01',
      }),
    ).toMatchObject({ scope: 'people', groupIds: [group.id], fromDay: '2026-03-01' });
    photoPartnerShares.update(share.id, { state: 'stopped' });
    expect(photoPartnerShares.open(fixture.alice, fixture.bob)).toBeUndefined();
    expect(offer(3, fixture.alice, fixture.bob).state).toBe('offered');
    expect(photoPartnerShares.sharedBy(fixture.alice)).toHaveLength(2);
    expect(photoPartnerShares.sharedWith(fixture.bob)).toHaveLength(2);
  });

  it('refuses sharing with oneself and people without a chosen person', () => {
    expect(() => offer(1, fixture.alice, fixture.alice)).toThrow(/constraint/);
    const share = offer(5, fixture.alice, fixture.bob);
    expect(() => fixture.repos.photoPartnerShares.update(share.id, { scope: 'people' })).toThrow(
      PhotoPartnerScopeError,
    );
    expect(fixture.repos.photoPartnerShares.byId(share.id).scope).toBe('all');
    fixture.repos.photoPartnerShares.update(share.id, { state: 'stopped' });
    expect(() =>
      fixture.repos.photoPartnerShares.insert({
        id: id('0e', 2),
        sharerId: fixture.alice,
        recipientId: fixture.bob,
        scope: 'people',
        groupIds: [],
        fromDay: '2026-01-01',
      }),
    ).toThrow(PhotoPartnerScopeError);
    expect(fixture.repos.photoPartnerShares.sharedBy(fixture.alice)).toHaveLength(1);
  });
});

describe('album share links', () => {
  it('creates a link to an album and lists it apart from item links', () => {
    const shares = new DriveSharesRepository(fixture.context);
    const link = shares.insert({
      id: id('0d', 1),
      itemId: null,
      albumId: album,
      tokenHash: 'album-token',
      permission: 'view',
      expiresAt: null,
      passwordHash: null,
      createdBy: fixture.alice,
      createdAt: NOW,
    });
    shares.insert({
      id: id('0d', 2),
      itemId: mine,
      tokenHash: 'item-token',
      permission: 'download',
      expiresAt: null,
      passwordHash: null,
      createdBy: fixture.alice,
      createdAt: NOW,
    });
    expect(link).toMatchObject({ itemId: null, albumId: album });
    expect(shares.forAlbum(album).map((share) => share.id)).toEqual([link.id]);
    expect(shares.forItem(mine).map((share) => share.albumId)).toEqual([null]);
    expect(shares.byTokenHash('album-token')?.share.albumId).toBe(album);
    fixture.albums.remove(album);
    expect(shares.find(link.id)).toBeUndefined();
  });
});
