import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  DRIVE_SHARED_WITH_ME_ENTRY,
  type DriveGrantRole,
  type DriveItem,
  type DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import {
  FOLDER_ID,
  GRANT_ID,
  MEMBER_ID,
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  personalRootRow,
  rootRow,
} from '../data/fixtures';
import {
  browsePlaceOf,
  crumbsOf,
  placeSectionOf,
  placeWritable,
  sharedCoverOf,
  titleOf,
  writeTargetOf,
  type PlaceInput,
} from './place-model';

const AT = '2026-11-07T10:00:00.000Z';
const FOREIGN_ROOT = 'a1b2c3d4-0000-4000-8000-0000000000aa';

function folderAt(
  id: string,
  relPath: string,
  parentId: string | null,
  rootId = ROOT_ID,
): DriveItem {
  return DRIVE_ITEM.parse({
    id,
    rootId,
    parentId,
    relPath,
    name: relPath.split('/').at(-1),
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    kind: 'folder',
    childCount: 0,
    bytes: 0,
  });
}

function idOf(index: number): string {
  return `c1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function entryOf(
  item: DriveItem,
  role: DriveGrantRole,
  grantId = GRANT_ID,
): DriveSharedWithMeEntry {
  return DRIVE_SHARED_WITH_ME_ENTRY.parse({
    item,
    grant: {
      id: grantId,
      itemId: item.id,
      profileId: MEMBER_ID,
      role,
      grantedBy: OWNER_ID,
      createdAt: AT,
    },
  });
}

const MINE = personalRootRow(ROOT_ID, MEMBER_ID);
const HOME = rootRow(OTHER_ROOT_ID, 'ready');

function input(patch: Partial<PlaceInput>): PlaceInput {
  return {
    roots: [MINE, HOME],
    viewerId: MEMBER_ID,
    rootId: ROOT_ID,
    folder: null,
    cover: null,
    nameOf: (id) => (id === OWNER_ID ? 'Dana' : null),
    ...patch,
  };
}

describe('browse place', () => {
  it('opens the viewer’s own drive and the Shared Drive under their own names', () => {
    const mine = browsePlaceOf(input({}));
    expect(mine).toMatchObject({ kind: 'mine', access: 'own', topLabel: 'My Drive' });
    const home = browsePlaceOf(input({ rootId: OTHER_ROOT_ID }));
    expect(home).toMatchObject({ kind: 'home', access: 'shared', topLabel: 'Shared Drive' });
    expect(placeSectionOf('mine')).toBe('index');
    expect(placeSectionOf('home')).toBe('shared-drive');
    expect(placeSectionOf('with-me')).toBe('shared');
  });

  it('writes into the open folder, or the top of the viewer’s own drive or the Shared Drive', () => {
    const mine = browsePlaceOf(input({}));
    const home = browsePlaceOf(input({ rootId: OTHER_ROOT_ID }));
    if (mine === null || home === null) throw new Error('no place');
    expect(writeTargetOf(mine, null)).toEqual({ kind: 'drive', rootId: ROOT_ID });
    expect(writeTargetOf(home, null)).toEqual({ kind: 'drive', rootId: OTHER_ROOT_ID });
    const folder = folderAt(FOLDER_ID, 'Taxes', null);
    expect(writeTargetOf(mine, folder)).toEqual({ kind: 'folder', folderId: FOLDER_ID });
  });

  it('never opens another person’s drive without a grant, the owner included', () => {
    const other = personalRootRow(FOREIGN_ROOT, OWNER_ID);
    expect(browsePlaceOf(input({ roots: [other], rootId: FOREIGN_ROOT }))).toBeNull();
    const folder = folderAt(FOLDER_ID, 'Taxes', null, FOREIGN_ROOT);
    expect(browsePlaceOf(input({ roots: [other], rootId: FOREIGN_ROOT, folder }))).toBeNull();
  });

  it('opens a shared folder and everything under it with the grant’s role', () => {
    const top = folderAt(FOLDER_ID, 'Taxes', null, FOREIGN_ROOT);
    const inner = folderAt(idOf(2), 'Taxes/2026/Receipts', idOf(1), FOREIGN_ROOT);
    const cover = sharedCoverOf([entryOf(top, 'view')], inner);
    expect(cover).toEqual({ top, role: 'view', sharerId: OWNER_ID });
    const place = browsePlaceOf(input({ rootId: FOREIGN_ROOT, folder: inner, cover }));
    expect(place).toMatchObject({ kind: 'with-me', access: 'view', topLabel: 'Dana’s folder' });
    if (place === null) return;
    expect(placeWritable(place, true)).toBe(false);
    expect(crumbsOf(place, inner)).toEqual([
      { key: 'shared', label: 'Shared with me', target: { kind: 'shared' } },
      { key: 'cover', label: 'Dana’s folder', target: { kind: 'folder', id: FOLDER_ID } },
      { key: 'Taxes/2026', label: '2026', target: { kind: 'folder', id: idOf(1) } },
    ]);
    expect(titleOf(place, inner)).toBe('Receipts');
    expect(writeTargetOf(place, null)).toBeNull();
  });

  it('takes the strongest role and the topmost shared folder, and ignores look-alike paths', () => {
    const top = folderAt(FOLDER_ID, 'Taxes', null, FOREIGN_ROOT);
    const inner = folderAt(idOf(1), 'Taxes/2026', FOLDER_ID, FOREIGN_ROOT);
    const cover = sharedCoverOf([entryOf(inner, 'edit', idOf(30)), entryOf(top, 'view')], inner);
    expect(cover?.top.id).toBe(FOLDER_ID);
    expect(cover?.role).toBe('edit');
    const lookAlike = folderAt(idOf(5), 'Taxes old', null, FOREIGN_ROOT);
    expect(sharedCoverOf([entryOf(top, 'view')], lookAlike)).toBeNull();
    const elsewhere = folderAt(idOf(6), 'Taxes/2026', null, ROOT_ID);
    expect(sharedCoverOf([entryOf(top, 'view')], elsewhere)).toBeNull();
  });

  it('starts the trail at the shared item itself when it is the open folder', () => {
    const top = folderAt(FOLDER_ID, 'Taxes', null, FOREIGN_ROOT);
    const cover = sharedCoverOf([entryOf(top, 'edit')], top);
    const place = browsePlaceOf(input({ rootId: FOREIGN_ROOT, folder: top, cover }));
    if (place === null) throw new Error('the shared folder opens');
    expect(placeWritable(place, true)).toBe(true);
    expect(placeWritable(place, false)).toBe(false);
    expect(crumbsOf(place, top).map((crumb) => [crumb.label, crumb.target])).toEqual([
      ['Shared with me', { kind: 'shared' }],
      ['Dana’s folder', null],
    ]);
  });

  it('links the drive top and the parent folder in a drive trail', () => {
    const place = browsePlaceOf(input({}));
    if (place === null) throw new Error('my drive opens');
    expect(crumbsOf(place, null)).toEqual([{ key: 'top', label: 'My Drive', target: null }]);
    const open = folderAt(idOf(9), 'Projects/Home/Kitchen', FOLDER_ID);
    expect(crumbsOf(place, open)).toEqual([
      { key: 'top', label: 'My Drive', target: { kind: 'top' } },
      { key: 'Projects', label: 'Projects', target: null },
      { key: 'Projects/Home', label: 'Home', target: { kind: 'folder', id: FOLDER_ID } },
    ]);
    expect(titleOf(place, null)).toBe('My Drive');
  });
});
