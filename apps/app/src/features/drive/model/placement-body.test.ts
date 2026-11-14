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
      mode: 'synced',
      localPath: '/home/a/Projects',
      sync: { excluded: ['Big'], ignorePatterns: ['*.tmp'], conflictCopies: false },
    });
    expect(body.excluded).toEqual(['Big']);
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
  });

  it('carries no sync settings for a mounted folder or the whole drive', () => {
    const body = placementBodyOf({
      deviceId: DEVICE,
      target: { rootId: OTHER_ROOT_ID, folderItemId: null },
      mode: 'mounted',
      localPath: '/mnt/d',
    });
    expect(body).toEqual({
      deviceId: DEVICE,
      rootId: OTHER_ROOT_ID,
      folderItemId: null,
      mode: 'mounted',
      localPath: '/mnt/d',
      enabled: true,
    });
    expect(DRIVE_PLACEMENT_SET.safeParse(body).success).toBe(true);
  });
});
