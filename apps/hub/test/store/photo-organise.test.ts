import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDENTITY_RECIPE } from '@smarteverything/domain';
import {
  ALICE_ROOT,
  NOW,
  id,
  insert,
  photo,
  photoFixture,
  type PhotoFixture,
} from './photo-fixture';

let fixture: PhotoFixture;
let first: string;
let second: string;

beforeEach(() => {
  fixture = photoFixture();
  first = photo(fixture.database, { n: 1, root: ALICE_ROOT });
  second = photo(fixture.database, { n: 2, root: ALICE_ROOT });
});

afterEach(() => {
  fixture.database.close();
});

const SHA = 'a'.repeat(64);

describe('photo edits', () => {
  it('keeps the last recipe per item and person', () => {
    const { photoEdits } = fixture.repos;
    const recipe = { ...IDENTITY_RECIPE, quarterTurns: 1 };
    expect(
      photoEdits.save(first, fixture.alice, { recipe, baseVersionId: null, resultSha256: SHA }),
    ).toMatchObject({
      itemId: first,
      recipe,
      baseVersionId: null,
    });
    photoEdits.save(first, fixture.alice, {
      recipe: IDENTITY_RECIPE,
      baseVersionId: null,
      resultSha256: SHA,
    });
    expect(photoEdits.find(first, fixture.alice)?.recipe).toEqual(IDENTITY_RECIPE);
    expect(photoEdits.find(first, fixture.bob)).toBeUndefined();
    photoEdits.remove(first, fixture.alice);
    expect(photoEdits.find(first, fixture.alice)).toBeUndefined();
  });

  it('keeps the base version and clears it when that version goes', () => {
    const version = id('0d', 1);
    insert(fixture.database, 'drive_versions', {
      id: version,
      root_id: ALICE_ROOT,
      item_id: first,
      rev: 1,
      sha256: 'a'.repeat(64),
      bytes: 10,
      at: NOW,
      purge_at: '2027-11-14T10:00:00.000Z',
      actor_profile_id: null,
      via: 'app',
      device_id: null,
      added_by_profile_id: null,
    });
    fixture.repos.photoEdits.save(first, fixture.alice, {
      recipe: IDENTITY_RECIPE,
      baseVersionId: version,
      resultSha256: SHA,
    });
    expect(fixture.repos.photoEdits.find(first, fixture.alice)?.baseVersionId).toBe(version);
    fixture.database.prepare('delete from drive_versions').run();
    expect(fixture.repos.photoEdits.find(first, fixture.alice)?.baseVersionId).toBeNull();
  });
});

describe('photo metadata overrides', () => {
  it('stores a date and a location and replaces them', () => {
    const { photoMetaOverrides } = fixture.repos;
    photoMetaOverrides.set({
      itemId: first,
      takenAt: '2024-01-01T09:00:00.000Z',
      tzOffsetMin: 60,
      latitude: 38.7,
      longitude: -9.1,
      placeLabel: 'Lisbon',
      locationCleared: false,
      setBy: fixture.alice,
    });
    expect(photoMetaOverrides.find(first)).toEqual({
      itemId: first,
      takenAt: '2024-01-01T09:00:00.000Z',
      tzOffsetMin: 60,
      latitude: 38.7,
      longitude: -9.1,
      placeLabel: 'Lisbon',
      locationCleared: false,
      setBy: fixture.alice,
      setAt: NOW,
    });
    photoMetaOverrides.set({
      itemId: first,
      takenAt: null,
      tzOffsetMin: null,
      latitude: 1,
      longitude: 2,
      placeLabel: null,
      locationCleared: false,
      setBy: null,
    });
    expect(photoMetaOverrides.forItems([first, second])).toHaveLength(1);
    expect(photoMetaOverrides.remove([first])).toBe(1);
  });

  it('refuses a half location, an offset without a date and an empty override', () => {
    const base = {
      itemId: first,
      takenAt: null,
      tzOffsetMin: null,
      latitude: null,
      longitude: null,
      placeLabel: null,
      locationCleared: false,
      setBy: null,
    } as const;
    const { photoMetaOverrides } = fixture.repos;
    expect(() => {
      photoMetaOverrides.set({ ...base, latitude: 1 });
    }).toThrow(/constraint/);
    expect(() => {
      photoMetaOverrides.set({ ...base, tzOffsetMin: 60, latitude: 1, longitude: 1 });
    }).toThrow(/constraint/);
    expect(() => {
      photoMetaOverrides.set(base);
    }).toThrow(/constraint/);
    expect(() => {
      photoMetaOverrides.set({ ...base, latitude: 91, longitude: 0 });
    }).toThrow(/constraint/);
  });
});

describe('photo archive', () => {
  it('archives per person without duplicates and restores', () => {
    const { photoArchive } = fixture.repos;
    expect(photoArchive.archive(fixture.alice, [first, second])).toBe(2);
    expect(photoArchive.archive(fixture.alice, [first])).toBe(0);
    expect(photoArchive.archive(fixture.bob, [first])).toBe(1);
    expect(photoArchive.archivedAmong(fixture.alice, [first, id('0b', 99)])).toEqual([first]);
    expect(photoArchive.count(fixture.alice)).toBe(2);
    expect(photoArchive.restore(fixture.alice, [first])).toBe(1);
    expect(photoArchive.count(fixture.alice)).toBe(1);
    expect(photoArchive.count(fixture.bob)).toBe(1);
  });
});

describe('Locked folder', () => {
  it('stores a PIN and ends open sessions when it changes', () => {
    const { photoLocked } = fixture.repos;
    expect(photoLocked.pin(fixture.alice)).toBeUndefined();
    photoLocked.setPin(fixture.alice, { hash: 'h1', salt: 's1' });
    expect(photoLocked.pin(fixture.alice)).toEqual({ hash: 'h1', salt: 's1' });
    photoLocked.setPin(fixture.alice, { hash: 'h2', salt: 's2' });
    expect(photoLocked.pin(fixture.alice)).toEqual({ hash: 'h2', salt: 's2' });
  });

  it('issues, reads, closes and expires unlock sessions', () => {
    const { photoLocked } = fixture.repos;
    const firstClient = id('1a', 1);
    const secondClient = id('1a', 2);
    for (const clientId of [firstClient, secondClient]) {
      insert(fixture.database, 'clients', {
        id: clientId,
        name: clientId,
        platform: 'android',
        role: 'member',
        token_hash: `token-${clientId}`,
        created_at: NOW,
        last_seen_at: NOW,
        profile_id: fixture.alice,
      });
    }
    photoLocked.issue('live', fixture.alice, firstClient, '2026-11-14T10:05:00.000Z');
    photoLocked.issue('old', fixture.alice, secondClient, '2026-11-14T09:00:00.000Z');
    expect(photoLocked.unlock('live')).toEqual({
      profileId: fixture.alice,
      clientId: firstClient,
      expiresAt: '2026-11-14T10:05:00.000Z',
    });
    expect(photoLocked.unlock('old')).toBeUndefined();
    expect(photoLocked.expire()).toBe(1);
    expect(photoLocked.lock(fixture.alice, firstClient)).toBe(1);
    expect(photoLocked.unlock('live')).toBeUndefined();
  });
});
