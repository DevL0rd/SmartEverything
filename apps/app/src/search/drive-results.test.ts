import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, DRIVE_QUERY, SMART_RULE, type DriveItem } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID } from '../features/drive/data/fixtures';
import {
  driveFoundText,
  driveGroupStateOf,
  driveSearchOf,
  driveSmartRuleOf,
  driveStripOf,
  fileEdgeOf,
  splitDriveHits,
} from './drive-results';

const AT = '2026-11-07T10:00:00.000Z';

function idOf(index: number): string {
  return `d1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(index: number, name: string): object {
  return {
    id: idOf(index),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: `Garden/${name}`,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'etag',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

const FILE = { bytes: 10, sha256: null, integrity: 'unknown', thumb: { state: 'ready' } };

const MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
};

function photo(index: number): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, `garden-${String(index)}.jpg`),
    ...FILE,
    ...MEDIA,
    kind: 'image',
    mime: 'image/jpeg',
  });
}

function clip(index: number): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, `garden-${String(index)}.mp4`),
    ...FILE,
    ...MEDIA,
    kind: 'video',
    mime: 'video/mp4',
    durationMs: 1000,
  });
}

function doc(index: number): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, `Garden plan ${String(index)}.pdf`),
    ...FILE,
    kind: 'document',
    mime: 'application/pdf',
  });
}

function folder(index: number): DriveItem {
  return DRIVE_ITEM.parse({ ...base(index, 'Garden'), kind: 'folder', childCount: 2, bytes: 0 });
}

const photos = (total: number): readonly DriveItem[] =>
  Array.from({ length: total }, (_, index) => photo(index + 1));

const SIGNALS = { searchable: true, live: true, answered: true, failed: false, found: 3 };

describe('the Photos and files group in global search', () => {
  it('asks the hub for the typed text across all of Drive, newest first', () => {
    expect(DRIVE_QUERY.parse({ ...driveSearchOf('  garden plan '), cursor: null })).toEqual({
      text: 'garden plan',
      rootId: null,
      folderId: null,
      kinds: null,
      starred: null,
      duration: null,
      taken: null,
      sort: { field: 'modifiedAt', direction: 'desc' },
      cursor: null,
    });
  });

  it('puts photos and videos in the thumbnail strip and everything else in rows', () => {
    const hits = splitDriveHits([doc(1), photo(2), folder(3), clip(4)]);
    expect(hits.photos.map((item) => item.kind)).toEqual(['image', 'video']);
    expect(hits.files.map((item) => item.kind)).toEqual(['document', 'folder']);
  });

  it('fills the strip to the measured width and sends the rest to Photos', () => {
    expect(driveStripOf(photos(3), 400, false)).toEqual({ shown: photos(3), rest: null });
    const wide = driveStripOf(photos(10), 400, false);
    expect(wide.shown).toHaveLength(3);
    expect(wide.rest).toBe('+7');
    const paged = driveStripOf(photos(4), 400, true);
    expect(paged.shown).toHaveLength(3);
    expect(paged.rest).toBe('1+');
    expect(driveStripOf(photos(4), 0, false).shown).toHaveLength(0);
  });

  it('stays out of the way until there is a Drive and a word to look for', () => {
    expect(driveGroupStateOf({ ...SIGNALS, searchable: false })).toBe('hidden');
    expect(driveGroupStateOf({ ...SIGNALS, found: 0 })).toBe('empty');
    expect(driveGroupStateOf(SIGNALS)).toBe('found');
  });

  it('says why it has nothing when the hub is away or the search failed', () => {
    expect(driveGroupStateOf({ ...SIGNALS, live: false })).toBe('offline');
    expect(driveGroupStateOf({ ...SIGNALS, failed: true })).toBe('failed');
    expect(driveGroupStateOf({ ...SIGNALS, answered: false })).toBe('looking');
  });

  it('counts what the hub returned and marks a count that has more pages', () => {
    expect(driveFoundText(1032, false)).toBe('1,032 in Drive');
    expect(driveFoundText(200, true)).toBe('200+ in Drive');
  });

  it('saves the search as a smart folder that needs every typed word in the path', () => {
    const rule = driveSmartRuleOf('garden, plan');
    expect(SMART_RULE.parse(rule)).toEqual({
      match: 'all',
      rules: [
        { kind: 'text', field: 'path', contains: 'garden' },
        { kind: 'text', field: 'path', contains: 'plan' },
      ],
    });
    expect(driveSmartRuleOf(' ?! ')).toBeNull();
  });

  it('rounds the file rows into one card like the local groups', () => {
    expect(fileEdgeOf(0, 1)).toBe('only');
    expect([0, 1, 2].map((index) => fileEdgeOf(index, 3))).toEqual(['first', 'middle', 'last']);
  });
});
