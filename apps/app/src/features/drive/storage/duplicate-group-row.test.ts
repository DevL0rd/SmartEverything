import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import {
  duplicateRowOf,
  duplicatesCaptionOf,
  extraBytesOf,
  keepAllLabelOf,
  ownDuplicatesOf,
  placesOf,
} from './duplicate-group-row';
import { driveChipsOf } from '../model/drive-chip';

const ROOT_A = '00000000-0000-4000-8000-0000000000a1';
const ROOT_B = '00000000-0000-4000-8000-0000000000b1';
const ROOT_THEIRS = '00000000-0000-4000-8000-0000000000c1';
const ME = '00000000-0000-4000-8000-0000000000d1';
const LABELS = driveChipsOf({
  roots: [
    { id: ROOT_A, scope: 'person', ownerProfileId: ME },
    { id: ROOT_B, scope: 'home', ownerProfileId: null },
  ],
  viewerId: ME,
  sharerOfRoot: new Map(),
  names: new Map(),
});
const SHA = 'a'.repeat(64);
const MB = 1024 ** 2;

function file(id: string, rootId: string, relPath: string): DriveItem {
  return DRIVE_ITEM.parse({
    id,
    rootId,
    parentId: null,
    relPath,
    name: relPath.split('/').at(-1),
    modifiedAt: '2026-11-07T10:00:00.000Z',
    addedAt: '2026-11-07T10:00:00.000Z',
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'application/pdf',
    bytes: 4 * MB,
    sha256: SHA,
    integrity: 'ok',
    thumb: { state: 'none' },
    kind: 'document',
  });
}

const ONE = file('00000000-0000-4000-8000-000000000001', ROOT_A, 'Lisbon 0412.jpg');
const TWO = file('00000000-0000-4000-8000-000000000002', ROOT_B, 'Photos/Lisbon 0412.jpg');
const THREE = file('00000000-0000-4000-8000-000000000003', ROOT_B, 'Older/Lisbon 0412.jpg');

describe('Storage duplicates', () => {
  it('names the file, the copies and every place they sit', () => {
    const view = duplicateRowOf({ sha256: SHA, bytes: 4 * MB, items: [ONE, TWO, THREE] }, LABELS);
    expect(view).toMatchObject({
      key: SHA,
      title: 'Lisbon 0412.jpg · 3 copies',
      places: 'My Drive, Shared Drive › Photos and Shared Drive › Older',
    });
  });

  it('lists a place once when two copies share it', () => {
    expect(placesOf([TWO, TWO], LABELS)).toBe('Shared Drive › Photos');
  });

  it('groups only copies in the drives the viewer owns or shares with the home', () => {
    const theirs = file('00000000-0000-4000-8000-000000000004', ROOT_THEIRS, 'Lisbon 0412.jpg');
    const groups = [
      { sha256: SHA, bytes: 4 * MB, items: [ONE, theirs] },
      { sha256: 'b'.repeat(64), bytes: MB, items: [ONE, TWO, theirs] },
    ];
    expect(ownDuplicatesOf(groups, LABELS)).toEqual([
      { sha256: 'b'.repeat(64), bytes: MB, items: [ONE, TWO] },
    ]);
  });

  it('counts the space won back as every copy beyond the first', () => {
    const groups = [
      { sha256: SHA, bytes: 4 * MB, items: [ONE, TWO, THREE] },
      { sha256: 'b'.repeat(64), bytes: MB, items: [ONE, TWO] },
    ];
    expect(extraBytesOf(groups)).toBe(9 * MB);
    expect(duplicatesCaptionOf(groups, true)).toBe(`2 groups · ${bytes(9 * MB)} to win back`);
  });

  it('only counts groups once every page has loaded', () => {
    expect(duplicatesCaptionOf([], false)).toBeNull();
    expect(keepAllLabelOf(86, true)).toBe('Keep best in all 86 groups');
    expect(keepAllLabelOf(86, false)).toBe('Keep best in all groups');
  });
});
