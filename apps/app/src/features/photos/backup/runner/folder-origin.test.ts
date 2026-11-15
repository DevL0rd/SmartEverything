import { BackupCycle, scopeOf } from './cycle';
import { Ledger, type StoredLedger } from '../model/ledger';
import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { ITEM_ID, digestOf, rig, rowOf } from './fixtures';

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

  describe('photos backed up before the hub tracked folders', () => {
    const entry = (localId: string): StoredLedger => ({
      version: 2,
      lastSeen: 1000,
      entries: [
        {
          localId,
          sha256: digestOf(`${localId}@1000`),
          bytes: 1000,
          modificationTime: 1000,
          uploadedAt: '2026-11-06T10:00:00.000Z',
          itemId: ITEM_ID,
        },
      ],
    });

    it('reports the album of an already backed-up photo the hub holds no album for', async () => {
      const t = rig();
      t.library.rows = [rowOf('old', 1000)];
      t.library.paths.set('old', 'Pictures/K PLUS');
      const cycle = new BackupCycle(
        t.ports,
        new Ledger(entry('old')),
        scopeOf(t.settings.value),
        new AbortController().signal,
      );
      expect(await cycle.run()).toBe('complete');
      expect(t.hub.originAsks).toEqual([
        { deviceId: t.ports.identity.deviceId, itemIds: [ITEM_ID] },
      ]);
      expect(t.hub.folders).toEqual([{ key: 'phone:Pictures/K PLUS', name: 'K PLUS' }]);
    });

    it('sends nothing when the hub already knows the album', async () => {
      const t = rig();
      t.library.rows = [rowOf('old', 1000)];
      t.hub.known.set(ITEM_ID, { key: 'phone:DCIM/Camera', name: 'Camera' });
      const cycle = new BackupCycle(
        t.ports,
        new Ledger(entry('old')),
        scopeOf(t.settings.value),
        new AbortController().signal,
      );
      expect(await cycle.run()).toBe('complete');
      expect(t.hub.folders).toEqual([]);
    });
  });
});
