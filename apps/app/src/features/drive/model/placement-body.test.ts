import { DRIVE_PLACEMENT_SET } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { FOLDER_ID, OTHER_ROOT_ID } from '../data/fixtures';
import { placementBodyOf } from './placement-body';

const DEVICE = 'a1b2c3d4-0000-4000-8000-000000000030';
const TARGET = { rootId: OTHER_ROOT_ID, folderItemId: FOLDER_ID };

describe('placement body', () => {
  it('carries the sync settings for a synced folder and passes the contract', () => {
    const body = placementBodyOf({
      deviceId: DEVICE,
      target: TARGET,
      localPath: '/home/a/Projects',
      sync: { excluded: ['Big'], ignorePatterns: ['*.tmp'], conflictCopies: false },
    });
    expect(body.excluded).toEqual(['Big']);
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
  });

  it('syncs the whole drive with the default settings, turned on', () => {
    const body = placementBodyOf({
      deviceId: DEVICE,
      target: { rootId: OTHER_ROOT_ID, folderItemId: null },
      localPath: '/home/a/Drive',
    });
    expect(body).toEqual({
      deviceId: DEVICE,
      rootId: OTHER_ROOT_ID,
      folderItemId: null,
      localPath: '/home/a/Drive',
      enabled: true,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
    });
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
  });
});
