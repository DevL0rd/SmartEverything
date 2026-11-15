import type { DriveItemDraft } from '../../src/store/repositories/drive-items';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AlarmSounds, DEFAULT_TONE } from '../../src/planner/alarm-sound';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const HOME = '0d000000-0000-4000-8000-000000000001';
const PRIVATE = '0d000000-0000-4000-8000-000000000002';
const NOW = '2026-11-07T08:00:00.000Z';

let test: TestStore;
let owner: TestPerson;
let other: TestPerson;
let sounds: AlarmSounds;
let counter: number;

function nextId(): string {
  counter += 1;
  return `0f000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function put(draft: DriveItemDraft): string {
  test.store.driveItems.write({ item: draft, identity: { dev: '1', ino: draft.id.slice(-8) } });
  return draft.id;
}

function folder(rootId: string, name: string): string {
  return put({
    id: nextId(),
    rootId,
    parentId: null,
    relPath: name,
    name,
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    kind: 'folder',
    childCount: 0,
    bytes: 0,
  });
}

function file(
  rootId: string,
  parentId: string | null,
  name: string,
  kind: 'audio' | 'image',
): string {
  const relPath =
    parentId === null ? name : `${test.store.driveItems.byId(parentId, null).relPath}/${name}`;
  const common = {
    id: nextId(),
    rootId,
    parentId,
    relPath,
    name,
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: kind === 'audio' ? 'audio/mpeg' : 'image/jpeg',
    bytes: 100,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  } as const;
  return put(
    kind === 'audio'
      ? { ...common, kind: 'audio', takenAt: null, durationMs: 1000 }
      : {
          ...common,
          kind: 'image',
          takenAt: null,
          width: null,
          height: null,
          orientation: null,
          camera: null,
          exposure: null,
          place: null,
        },
  );
}

function resolveAt(
  sound: Parameters<AlarmSounds['resolve']>[1],
  key: string,
  due = NOW,
): ReturnType<AlarmSounds['resolve']> {
  return sounds.resolve(owner.profileId, sound, key, new Date(due));
}

beforeEach(async () => {
  counter = 0;
  test = await testStore(() => new Date(NOW));
  owner = addPerson(test, 'Owner', 'owner');
  other = addPerson(test, 'Other', 'member');
  test.store.driveRoots.insert(sharedDriveRoot(HOME));
  test.store.driveRoots.insert(personalDriveRoot(PRIVATE, other.profileId));
  sounds = new AlarmSounds(test.store, testLogger('sounds'));
});

afterEach(async () => {
  await test.close();
});

describe('resolving a sound', () => {
  it('passes a tone and a radio station through unchanged', () => {
    expect(resolveAt({ kind: 'tone', id: 'sunrise' }, 'alarm:a')).toEqual({
      kind: 'tone',
      id: 'sunrise',
    });
    const radio = {
      kind: 'radio',
      station_id: 'abc',
      name: 'Morning',
      url: 'https://radio.example/stream',
    } as const;
    expect(resolveAt(radio, 'alarm:a')).toEqual(radio);
  });

  it('turns a file into its name and etag so a phone can download and verify it', () => {
    const id = file(HOME, null, 'wake.mp3', 'audio');
    const item = test.store.driveItems.byId(id, null);
    expect(resolveAt({ kind: 'file', item_id: id }, 'alarm:a')).toEqual({
      kind: 'file',
      item_id: id,
      name: 'wake.mp3',
      etag: item.etag,
    });
  });

  it('rings the default tone and logs when the file is gone or is not audio', () => {
    const logs = captureLogs();
    const picture = file(HOME, null, 'cat.jpg', 'image');
    expect(resolveAt({ kind: 'file', item_id: picture }, 'alarm:a')).toEqual(DEFAULT_TONE);
    expect(resolveAt({ kind: 'file', item_id: nextId() }, 'alarm:b')).toEqual(DEFAULT_TONE);
    expect(
      logs.events().filter((event) => event === 'planner.alarm_sound_unavailable'),
    ).toHaveLength(2);
  });
});

describe('playlists', () => {
  function playlist(): { folderId: string; tracks: string[] } {
    const folderId = folder(HOME, 'Wake up');
    const tracks = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3'].map((name) =>
      file(HOME, folderId, name, 'audio'),
    );
    file(HOME, folderId, 'cover.jpg', 'image');
    return { folderId, tracks };
  }

  it('picks only audio files of the folder', () => {
    const { folderId, tracks } = playlist();
    for (let day = 1; day <= 8; day += 1) {
      const picked = resolveAt(
        { kind: 'playlist', item_id: folderId, shuffle: true },
        'alarm:a',
        `2026-11-${String(day).padStart(2, '0')}T06:00:00.000Z`,
      );
      expect(picked.kind).toBe('file');
      expect(tracks).toContain(picked.kind === 'file' ? picked.item_id : '');
    }
  });

  it('keeps the shuffled track stable for the same ring and varies it between rings', () => {
    const { folderId } = playlist();
    const sound = { kind: 'playlist', item_id: folderId, shuffle: true } as const;
    const first = resolveAt(sound, 'alarm:a');
    expect(resolveAt(sound, 'alarm:a')).toEqual(first);
    const picks = new Set(
      Array.from({ length: 20 }, (_, index) =>
        JSON.stringify(resolveAt(sound, `alarm:${String(index)}`)),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('plays the tracks in name order, one per day, when not shuffled', () => {
    const { folderId } = playlist();
    const names = [1, 2, 3, 4, 5].map((day) => {
      const picked = resolveAt(
        { kind: 'playlist', item_id: folderId, shuffle: false },
        'alarm:a',
        `2026-11-0${String(day)}T06:00:00.000Z`,
      );
      return picked.kind === 'file' ? picked.name : '';
    });
    expect(new Set(names.slice(0, 4)).size).toBe(4);
    expect(names[4]).toBe(names[0]);
    expect([...names.slice(0, 4)].sort()).toEqual(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']);
  });

  it('plays the audio members of an album in their order', () => {
    const first = file(HOME, null, 'one.mp3', 'audio');
    const second = file(HOME, null, 'two.mp3', 'audio');
    const album = test.store.driveAlbums.insert({
      id: nextId(),
      title: 'Mornings',
      kind: 'manual',
      surface: 'drive',
      scope: 'home',
      ownerProfileId: null,
      coverItemId: null,
    });
    test.store.driveAlbums.addItems(album.id, [first, second]);
    const picked = resolveAt({ kind: 'playlist', item_id: album.id, shuffle: false }, 'alarm:a');
    const expected = [first, second][Math.floor(Date.parse(NOW) / 86_400_000) % 2];
    expect(picked.kind === 'file' ? picked.item_id : '').toBe(expected);
    expect(
      sounds.media(owner.profileId, { kind: 'playlist', item_id: album.id, shuffle: false }),
    ).toHaveLength(2);
  });

  it('rings the default tone for an empty folder', () => {
    const empty = folder(HOME, 'Empty');
    expect(resolveAt({ kind: 'playlist', item_id: empty, shuffle: false }, 'alarm:a')).toEqual(
      DEFAULT_TONE,
    );
  });

  it('changes the media fingerprint when a file changes', () => {
    const id = file(HOME, null, 'wake.mp3', 'audio');
    const before = sounds.media(owner.profileId, { kind: 'file', item_id: id });
    const item = test.store.driveItems.byId(id, null);
    test.store.driveItems.write({
      item: { ...item, bytes: 999, modifiedAt: '2026-11-08T08:00:00.000Z' },
      identity: { dev: '1', ino: id.slice(-8) },
    });
    expect(sounds.media(owner.profileId, { kind: 'file', item_id: id })).not.toEqual(before);
    expect(before).toHaveLength(1);
  });
});

describe('a sleep sound for a phone', () => {
  it('passes noise and a radio station through as the phone plays them', () => {
    expect(sounds.sleepSource(owner.profileId, { kind: 'noise', colour: 'pink' })).toEqual({
      kind: 'noise',
      colour: 'pink',
    });
    expect(
      sounds.sleepSource(owner.profileId, {
        kind: 'radio',
        station_id: 'abc',
        name: 'Calm',
        url: 'https://radio.example/stream',
      }),
    ).toEqual({ kind: 'radio', name: 'Calm', url: 'https://radio.example/stream' });
  });

  it('lists the name and etag of a file and of every audio file of a folder', () => {
    const song = file(HOME, null, 'rain.mp3', 'audio');
    const rain = test.store.driveItems.byId(song, null);
    expect(sounds.sleepSource(owner.profileId, { kind: 'file', item_id: song })).toEqual({
      kind: 'files',
      files: [{ item_id: song, name: 'rain.mp3', etag: rain.etag }],
      shuffle: false,
    });
    const folderId = folder(HOME, 'Night');
    const first = file(HOME, folderId, 'a.mp3', 'audio');
    file(HOME, folderId, 'cover.jpg', 'image');
    const listed = sounds.sleepSource(owner.profileId, {
      kind: 'playlist',
      item_id: folderId,
      shuffle: true,
    });
    expect(listed).toMatchObject({ kind: 'files', shuffle: true });
    expect(listed.kind === 'files' ? listed.files.map((entry) => entry.item_id) : []).toEqual([
      first,
    ]);
  });

  it('refuses a Drive sound with no audio to play', () => {
    const empty = folder(HOME, 'Empty');
    expect(() =>
      sounds.sleepSource(owner.profileId, { kind: 'playlist', item_id: empty, shuffle: false }),
    ).toThrow('no audio file');
    const picture = file(HOME, null, 'cover.jpg', 'image');
    expect(() => sounds.sleepSource(owner.profileId, { kind: 'file', item_id: picture })).toThrow(
      'no audio file',
    );
  });
});

describe('checking that a sound can be used', () => {
  it('accepts tones, radio, audio files and folders', () => {
    const id = file(HOME, null, 'wake.mp3', 'audio');
    const folderId = folder(HOME, 'Wake up');
    expect(() => {
      sounds.assertUsable(owner.profileId, { kind: 'tone', id: 'default' });
      sounds.assertUsable(owner.profileId, { kind: 'file', item_id: id });
      sounds.assertUsable(owner.profileId, { kind: 'playlist', item_id: folderId, shuffle: true });
    }).not.toThrow();
  });

  it('refuses a missing file, a picture and a file the person cannot open', () => {
    const picture = file(HOME, null, 'cat.jpg', 'image');
    const hidden = file(PRIVATE, null, 'private.mp3', 'audio');
    expect(() => {
      sounds.assertUsable(owner.profileId, { kind: 'file', item_id: nextId() });
    }).toThrow(/audio file/);
    expect(() => {
      sounds.assertUsable(owner.profileId, { kind: 'file', item_id: picture });
    }).toThrow(/audio file/);
    expect(() => {
      sounds.assertUsable(owner.profileId, { kind: 'file', item_id: hidden });
    }).toThrow(/audio file/);
    expect(() => {
      sounds.assertUsable(other.profileId, { kind: 'file', item_id: hidden });
    }).not.toThrow();
  });

  it('refuses a playlist that is neither a folder nor an album', () => {
    const id = file(HOME, null, 'wake.mp3', 'audio');
    expect(() => {
      sounds.assertUsable(owner.profileId, { kind: 'playlist', item_id: id, shuffle: false });
    }).toThrow(/folder or album/);
  });
});
