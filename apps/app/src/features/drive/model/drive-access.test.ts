import { describe, expect, it } from 'vitest';
import {
  canOpen,
  canPlace,
  canSharePeople,
  canShareLink,
  canWrite,
  driveAccessOf,
  driveLabelOf,
  driveOfItemView,
  driveOfRootId,
  grantRoleOf,
  ownDriveOf,
  placementReadOnly,
  sharedDriveOf,
  sharedItemLabel,
  sharedTrailLabel,
  type DriveAccess,
} from './drive-access';
import {
  FOLDER_ID,
  GRANT_ID,
  MEMBER_ID,
  OTHER_FOLDER_ID,
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  grantRow,
  personalRootRow,
  rootRow,
} from '../data/fixtures';

const SHARED = rootRow(ROOT_ID, 'ready');
const OWN = personalRootRow(OTHER_ROOT_ID, OWNER_ID);
const THEIRS = personalRootRow('a1b2c3d4-0000-4000-8000-000000000020', MEMBER_ID);
const OPEN_WRITE: readonly DriveAccess[] = ['own', 'shared', 'edit'];
const NOT_OWN: readonly DriveAccess[] = ['shared', 'edit', 'view', 'none'];
const ROOTS = [SHARED, OWN, THEIRS];

describe('drive labels', () => {
  it('names the own drive and the Shared Drive and never another person’s drive', () => {
    expect(driveLabelOf(OWN, OWNER_ID)).toBe('My Drive');
    expect(driveLabelOf(SHARED, OWNER_ID)).toBe('Shared Drive');
    expect(driveLabelOf(THEIRS, OWNER_ID)).toBeNull();
  });

  it('labels the top of a shared item with the sharer', () => {
    expect(sharedItemLabel('Sam', { kind: 'folder' })).toBe('Sam’s folder');
    expect(sharedItemLabel('Sam', { kind: 'document' })).toBe('Sam’s file');
    expect(sharedTrailLabel('Sam', { kind: 'folder' })).toBe('Shared with me › Sam’s folder');
  });
});

describe('drive lookup', () => {
  it('finds the own drive, the Shared Drive and the drive of an item', () => {
    expect(ownDriveOf(ROOTS, OWNER_ID)).toBe(OWN);
    expect(ownDriveOf(ROOTS, MEMBER_ID)).toBe(THEIRS);
    expect(ownDriveOf([SHARED], OWNER_ID)).toBeNull();
    expect(sharedDriveOf(ROOTS)).toBe(SHARED);
    expect(driveOfRootId(ROOTS, THEIRS.id)).toBe(THEIRS);
    expect(driveOfRootId(ROOTS, FOLDER_ID)).toBeNull();
  });
});

describe('access role', () => {
  const view = grantRow(GRANT_ID, FOLDER_ID, OWNER_ID, 'view');
  const edit = grantRow(GRANT_ID.replace(/2$/, '3'), OTHER_FOLDER_ID, OWNER_ID, 'edit');
  const aboutOther = grantRow(GRANT_ID.replace(/2$/, '4'), FOLDER_ID, MEMBER_ID, 'edit');

  it('takes the strongest grant of the viewer on the item or a covering folder', () => {
    expect(grantRoleOf([view], OWNER_ID, [null, FOLDER_ID])).toBe('view');
    expect(grantRoleOf([view, edit], OWNER_ID, [FOLDER_ID, OTHER_FOLDER_ID])).toBe('edit');
    expect(grantRoleOf([aboutOther], OWNER_ID, [FOLDER_ID])).toBeNull();
    expect(grantRoleOf([view], OWNER_ID, [OTHER_FOLDER_ID])).toBeNull();
  });

  it('has no admin level: the owner has no access to another person’s drive without a grant', () => {
    expect(driveAccessOf(OWN, OWNER_ID, null)).toBe('own');
    expect(driveAccessOf(SHARED, MEMBER_ID, null)).toBe('shared');
    expect(driveAccessOf(THEIRS, OWNER_ID, null)).toBe('none');
    expect(driveAccessOf(THEIRS, OWNER_ID, 'view')).toBe('view');
    expect(driveAccessOf(THEIRS, OWNER_ID, 'edit')).toBe('edit');
  });

  it('lets the access decide what the person may do', () => {
    expect(canOpen('none')).toBe(false);
    for (const access of OPEN_WRITE) expect(canWrite(access)).toBe(true);
    expect(canWrite('view')).toBe(false);
    expect(canSharePeople('own')).toBe(true);
    for (const access of NOT_OWN) expect(canSharePeople(access)).toBe(false);
    expect(canShareLink('shared')).toBe(true);
    expect(canShareLink('edit')).toBe(false);
    expect(canPlace('view')).toBe(true);
    expect(canPlace('none')).toBe(false);
    expect(placementReadOnly('view')).toBe(true);
    expect(placementReadOnly('edit')).toBe(false);
  });
});

describe('drive of an item', () => {
  const profiles = [
    { id: OWNER_ID, name: 'Alex' },
    { id: MEMBER_ID, name: 'Sam' },
  ];
  const item = { id: FOLDER_ID, rootId: THEIRS.id, parentId: null, kind: 'folder' } as const;

  it('labels and opens a shared folder of another person by its grant only', () => {
    const base = { roots: ROOTS, profiles, viewerId: OWNER_ID, item, ancestorIds: [] };
    expect(driveOfItemView({ ...base, grants: [] })).toMatchObject({
      label: 'Sam’s folder',
      access: 'none',
    });
    const shared = driveOfItemView({
      ...base,
      grants: [grantRow(GRANT_ID, FOLDER_ID, OWNER_ID, 'edit')],
    });
    expect(shared).toMatchObject({ access: 'edit', grantRole: 'edit', root: THEIRS });
  });

  it('opens an inner item through a grant on a covering ancestor', () => {
    const inner = {
      id: OTHER_FOLDER_ID,
      rootId: THEIRS.id,
      parentId: FOLDER_ID,
      kind: 'image',
    } as const;
    const view = driveOfItemView({
      roots: ROOTS,
      profiles,
      viewerId: OWNER_ID,
      item: inner,
      ancestorIds: [],
      grants: [grantRow(GRANT_ID, FOLDER_ID, OWNER_ID, 'view')],
    });
    expect(view).toMatchObject({ access: 'view', label: 'Sam’s file' });
  });

  it('labels the own drive and the Shared Drive and has no drive for an unknown root', () => {
    const own = { id: FOLDER_ID, rootId: OWN.id, parentId: null, kind: 'folder' } as const;
    const base = { roots: ROOTS, profiles, grants: [], ancestorIds: [] };
    expect(driveOfItemView({ ...base, viewerId: OWNER_ID, item: own })).toMatchObject({
      label: 'My Drive',
      access: 'own',
    });
    expect(
      driveOfItemView({ ...base, viewerId: MEMBER_ID, item: { ...own, rootId: SHARED.id } }),
    ).toMatchObject({ label: 'Shared Drive', access: 'shared' });
    expect(
      driveOfItemView({ ...base, viewerId: OWNER_ID, item: { ...own, rootId: FOLDER_ID } }).root,
    ).toBeNull();
  });
});
