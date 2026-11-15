import { describe, expect, it } from 'vitest';
import { personalRootRow, rootRow } from '../data/fixtures';
import {
  changedBodyOf,
  childPath,
  drivePathOf,
  locationOf,
  mountOn,
  placementsOn,
  syncedOn,
  type DriveNames,
} from './placement-model';
import { FOLDER, LAPTOP, ME, OTHER_ROOT, ROOT, WORKSTATION, placement } from './placement-fixture';

const NAMES: DriveNames = {
  roots: [personalRootRow(ROOT, ME), rootRow(OTHER_ROOT, 'ready')],
  viewerId: ME,
};

const PROJECTS = { name: 'Projects' } as const;

describe('placement model', () => {
  it('names the drive and folder the way the sidebar does', () => {
    expect(drivePathOf({ rootId: ROOT, folderItemId: null }, null, NAMES)).toBe('My Drive');
    expect(drivePathOf({ rootId: ROOT, folderItemId: FOLDER }, PROJECTS, NAMES)).toBe(
      'My Drive › Projects',
    );
    expect(drivePathOf({ rootId: OTHER_ROOT, folderItemId: null }, null, NAMES)).toBe(
      'Shared Drive',
    );
    expect(drivePathOf({ rootId: FOLDER, folderItemId: FOLDER }, PROJECTS, NAMES)).toBe(
      'Shared with me › Projects',
    );
    expect(drivePathOf({ rootId: FOLDER, folderItemId: FOLDER }, null, NAMES)).toBe(
      'A drive you cannot open',
    );
  });

  it('lists the placements of one computer by local path or mount name', () => {
    const rows = [
      placement({ id: 'e0000000-0000-4000-8000-000000000002', mode: 'synced', localPath: '/z' }),
      placement({ mountName: '/m' }),
      placement({ id: 'e0000000-0000-4000-8000-000000000004', mode: 'synced', localPath: '/a' }),
      placement({ id: 'e0000000-0000-4000-8000-000000000003', deviceId: LAPTOP }),
    ];
    expect(placementsOn(WORKSTATION, rows).map((row) => row.localPath ?? row.mountName)).toEqual([
      '/a',
      '/m',
      '/z',
    ]);
  });

  it('shows the chosen folder of a synced placement and no place for the mount', () => {
    expect(locationOf(placement({ mode: 'synced', localPath: '/home/me/Docs' }))).toBe(
      '/home/me/Docs',
    );
    expect(locationOf(placement())).toBeNull();
    expect(
      locationOf(placement({}, { mountPoint: '/run/user/1000/smarteverything/Drive' })),
    ).toBeNull();
  });

  it('splits a computer into its synced folders and its one mount', () => {
    const synced = placement({
      id: 'e0000000-0000-4000-8000-000000000002',
      mode: 'synced',
      localPath: '/a',
    });
    const mount = placement();
    const rows = [
      synced,
      mount,
      placement({ id: 'e0000000-0000-4000-8000-000000000003', deviceId: LAPTOP }),
    ];
    expect(syncedOn(WORKSTATION, rows)).toEqual([synced]);
    expect(mountOn(WORKSTATION, rows, ROOT)).toBe(mount);
    expect(mountOn(WORKSTATION, [synced], ROOT)).toBeNull();
    expect(mountOn(WORKSTATION, rows, null)).toBeNull();
  });

  it('finds only the mount of the viewer’s own My Drive', () => {
    const shared = placement({ rootId: OTHER_ROOT });
    expect(mountOn(WORKSTATION, [shared], ROOT)).toBeNull();
    expect(mountOn(WORKSTATION, [shared], OTHER_ROOT)).toBe(shared);
  });

  it('builds local paths in the computer’s own separator', () => {
    expect(childPath('/home/me', 'My Drive')).toBe('/home/me/My Drive');
    expect(childPath('C:\\Users\\Me\\', 'Projects')).toBe('C:\\Users\\Me\\Projects');
  });

  it('keeps the sync settings when one field changes', () => {
    const synced = placement({ mode: 'synced', excluded: ['Raw'], ignorePatterns: ['*.tmp'] });
    expect(changedBodyOf(synced, { enabled: false })).toMatchObject({
      enabled: false,
      excluded: ['Raw'],
      ignorePatterns: ['*.tmp'],
      conflictCopies: true,
    });
    expect(changedBodyOf(synced, { sync: { conflictCopies: false } }).conflictCopies).toBe(false);
    expect(() => changedBodyOf(placement(), { enabled: false })).toThrow(/toggle/);
  });
});
