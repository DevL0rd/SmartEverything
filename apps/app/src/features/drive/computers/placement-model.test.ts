import { describe, expect, it } from 'vitest';
import { personalRootRow, rootRow } from '../data/fixtures';
import {
  changedBodyOf,
  childPath,
  drivePathOf,
  parentPath,
  pausedBodiesOf,
  placementsOn,
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

  it('lists the placements of one computer by local path', () => {
    const rows = [
      placement({ id: 'e0000000-0000-4000-8000-000000000002', localPath: '/z' }),
      placement({ localPath: '/a' }),
      placement({ id: 'e0000000-0000-4000-8000-000000000003', deviceId: LAPTOP }),
    ];
    expect(placementsOn(WORKSTATION, rows).map((row) => row.localPath)).toEqual(['/a', '/z']);
  });

  it('builds local paths in the computer’s own separator', () => {
    expect(childPath('/home/me', 'My Drive')).toBe('/home/me/My Drive');
    expect(childPath('C:\\Users\\Me\\', 'Projects')).toBe('C:\\Users\\Me\\Projects');
    expect(parentPath('/home/me/Drive')).toBe('/home/me');
    expect(parentPath('C:\\Drive')).toBe('C:\\');
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
    expect(changedBodyOf(placement(), { localPath: '/mnt/x' })).not.toHaveProperty('excluded');
  });

  it('pauses only the placements that run and are not on hold', () => {
    const rows = [
      placement(),
      placement({ id: 'e0000000-0000-4000-8000-000000000002', hold: 'no_access' }),
      placement({ id: 'e0000000-0000-4000-8000-000000000003', enabled: false }),
    ];
    expect(pausedBodiesOf(rows, false)).toHaveLength(1);
  });
});
