import { DRIVE_PLACEMENT_SET } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { FOLDER_ID, ROOT_ID, folderFixture, rootRow } from '../data/fixtures';
import { driveNodeOf } from '../source/drive-node';
import { DRIVE_PLACES } from '../source/drive-places';
import { mountPlaceOf, pickedFolderOf, sheetBodyOf } from './placement-model';
import { FOLDER, ROOT, WORKSTATION } from './placement-fixture';

const PICKED = { rootId: ROOT, folderItemId: FOLDER, name: 'Trips' };

describe('the placement sheet', () => {
  it('mounts the picked folder under its own name without asking for a place', () => {
    const body = sheetBodyOf(WORKSTATION, 'mounted', PICKED, null);
    expect(body).toMatchObject({ mode: 'mounted', localPath: null, mountName: 'Trips' });
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
    expect(sheetBodyOf(WORKSTATION, 'mounted', null, null)).toBeNull();
    expect(mountPlaceOf('Laptop', PICKED)).toBe(
      'Mounts as Trips where Laptop keeps network drives',
    );
  });

  it('still needs a folder on the computer to sync', () => {
    expect(sheetBodyOf(WORKSTATION, 'synced', PICKED, null)).toBeNull();
    const body = sheetBodyOf(WORKSTATION, 'synced', PICKED, '/home/me/Trips');
    expect(body).toMatchObject({ mode: 'synced', localPath: '/home/me/Trips', mountName: null });
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
  });
});

describe('the Drive folder picked for a placement', () => {
  const context = {
    roots: [rootRow(ROOT_ID, 'ready')],
    viewerId: null,
    shared: [],
    offline: new Map(),
    placements: new Map(),
  };
  const folder = driveNodeOf(folderFixture({ id: FOLDER_ID, name: 'Trips' }), context);
  const topOf = (place: string): string | null => (place === DRIVE_PLACES.myDrive ? ROOT_ID : null);

  it('takes the root and folder of a picked folder', () => {
    const choice = {
      kind: 'folder',
      location: { place: DRIVE_PLACES.myDrive, folder: FOLDER_ID },
      folder,
      label: 'Trips',
    } as const;
    expect(pickedFolderOf(choice, topOf)).toEqual({
      rootId: ROOT_ID,
      folderItemId: FOLDER_ID,
      name: 'Trips',
    });
  });

  it('takes the drive itself when its top is picked', () => {
    const choice = {
      kind: 'folder',
      location: { place: DRIVE_PLACES.myDrive, folder: null },
      folder: null,
      label: 'My Drive',
    } as const;
    expect(pickedFolderOf(choice, topOf)).toEqual({
      rootId: ROOT_ID,
      folderItemId: null,
      name: 'My Drive',
    });
    expect(pickedFolderOf({ kind: 'files', nodes: [folder] }, topOf)).toBeNull();
  });
});
