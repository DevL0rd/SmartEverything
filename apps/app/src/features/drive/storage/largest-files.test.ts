import { DRIVE_ITEM, DRIVE_QUERY, type DriveItem } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { driveChipsOf } from '../model/drive-chip';
import { LARGEST_QUERY, inOwnDrives, largestEntriesOf } from './largest-files';

const ROOT = '00000000-0000-4000-8000-0000000000a1';
const THEIRS = '00000000-0000-4000-8000-0000000000b1';
const ME = '00000000-0000-4000-8000-0000000000c1';
const CHIPS = driveChipsOf({
  roots: [{ id: ROOT, scope: 'person', ownerProfileId: ME }],
  viewerId: ME,
  sharerOfRoot: new Map(),
  names: new Map(),
});
const GB = 1024 ** 3;

function file(id: string, relPath: string, size: number): DriveItem {
  return DRIVE_ITEM.parse({
    id,
    rootId: ROOT,
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
    bytes: size,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    kind: 'document',
  });
}

describe('Largest files', () => {
  it('asks the hub for every file kind but folders, biggest first', () => {
    expect(DRIVE_QUERY.parse({ ...LARGEST_QUERY, cursor: null }).sort).toEqual({
      field: 'bytes',
      direction: 'desc',
    });
    expect(LARGEST_QUERY.kinds).not.toContain('folder');
  });

  it('sizes each bar against the largest file and says where it sits', () => {
    const entries = largestEntriesOf(
      [
        file('00000000-0000-4000-8000-000000000001', 'Films/Archive/Wedding.mov', 48 * GB),
        file('00000000-0000-4000-8000-000000000002', 'Cut.mp4', 12 * GB),
      ],
      CHIPS,
    );
    expect(entries.map((entry) => [entry.label, entry.value, entry.share])).toEqual([
      ['Wedding.mov', bytes(48 * GB), 1],
      ['Cut.mp4', bytes(12 * GB), 0.25],
    ]);
    expect(entries[0]?.spoken).toBe(
      `Wedding.mov, ${bytes(48 * GB)}, in My Drive › Films › Archive`,
    );
    expect(entries[1]?.spoken).toBe(`Cut.mp4, ${bytes(12 * GB)}, in My Drive`);
  });

  it('lists only files in drives the viewer can open as their own or the home’s', () => {
    const mine = file('00000000-0000-4000-8000-000000000001', 'Cut.mp4', GB);
    const theirs = {
      ...file('00000000-0000-4000-8000-000000000002', 'Big.mov', 9 * GB),
      rootId: THEIRS,
    };
    expect(inOwnDrives([theirs, mine], CHIPS)).toEqual([mine]);
  });
});
