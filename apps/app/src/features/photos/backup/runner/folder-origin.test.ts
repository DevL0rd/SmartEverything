import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { rig, rowOf } from './fixtures';

describe('where a backed-up photo came from', () => {
  beforeEach(() => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
  });

  it('tells the hub the phone album of every photo it checks for backup', async () => {
    const t = rig();
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    await t.runner.request();
    expect(t.hub.checkPurposes).toEqual(['backup']);
    expect(t.hub.folders).toEqual([
      { key: 'phone:DCIM/Camera', name: 'Camera' },
      { key: 'phone:DCIM/Camera', name: 'Camera' },
    ]);
  });
});
