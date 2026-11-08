import { deferred } from './deferred-fixture';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, rig } from './fixtures';
import { BackupRunner } from './runner';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { scopedBackupStorage } from './scoped-storage';
import { LEDGER_STORAGE_KEY, PAUSED_STORAGE_KEY } from './ledger-store';

describe('backup storage authority', () => {
  it('isolates ledger and pause by complete scope and ignores ambiguous old data', async () => {
    const disk = new MemoryStorage();
    await disk.setItem(LEDGER_STORAGE_KEY, 'old-unscoped');
    const alice = scopedBackupStorage(disk, 'hub/client/alice/phone', () => true);
    const bob = scopedBackupStorage(disk, 'hub/client/bob/phone', () => true);
    await alice.setItem(LEDGER_STORAGE_KEY, 'alice');
    await alice.setItem(PAUSED_STORAGE_KEY, 'true');
    expect(await bob.getItem(LEDGER_STORAGE_KEY)).toBeNull();
    expect(await bob.getItem(PAUSED_STORAGE_KEY)).toBeNull();
    expect(await alice.getItem(LEDGER_STORAGE_KEY)).toBe('alice');
    expect(await disk.getItem(LEDGER_STORAGE_KEY)).toBe('old-unscoped');
  });

  it('prevents late async work from persisting after its owner is invalidated', async () => {
    const disk = new MemoryStorage();
    let current = true;
    const scoped = scopedBackupStorage(disk, 'old', () => current);
    const release = deferred<null>();
    const late = release.promise.then(() => scoped.setItem(LEDGER_STORAGE_KEY, 'stale'));
    current = false;
    release.resolve(null);
    await late;
    expect(disk.values.size).toBe(0);
  });
});

it('persists an explicit pause for its captured scope before a replacement runner starts', async () => {
  backupStatus.set(INITIAL_BACKUP_STATUS);
  const t = rig();
  let current = true;
  const storage = scopedBackupStorage(t.storage, 'original-owner', () => current);
  const runner = new BackupRunner({ ...t.ports, storage });
  const paused = runner.pause();
  current = false;
  await runner.stop();
  await paused;
  const replacement = new BackupRunner({
    ...t.ports,
    storage: scopedBackupStorage(t.storage, 'original-owner', () => true),
  });
  await replacement.request();
  expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
  expect(
    await scopedBackupStorage(t.storage, 'another-owner', () => true).getItem(PAUSED_STORAGE_KEY),
  ).toBeNull();
  expect(t.upload.started).toEqual([]);
});
