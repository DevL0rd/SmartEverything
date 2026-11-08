import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Ledger } from '../model/ledger';
import { backupStatus, INITIAL_BACKUP_STATUS, type BackupStatus } from '../model/status';
import { BackupCycle, scopeOf } from './cycle';
import { digestOf, ITEM_ID, rig, rowOf } from './fixtures';

beforeEach(() => {
  backupStatus.set(INITIAL_BACKUP_STATUS);
});

describe('backup cycle planning', () => {
  it('finishes every scan page before hashing and keeps the upload denominator fixed', async () => {
    const t = rig();
    t.library.rows = Array.from({ length: 5 }, (_, index) => rowOf(String(index), index + 1000));
    t.native.sizes.set('4', 2000);
    const hashFile = t.native.hashFile.bind(t.native);
    const scannedPages: number[] = [];
    vi.spyOn(t.native, 'hashFile').mockImplementation((uri) => {
      scannedPages.push(t.library.pagesRead);
      return hashFile(uri);
    });
    const states: BackupStatus[] = [];
    const unsubscribe = backupStatus.subscribe(() => {
      states.push(backupStatus.get());
    });
    try {
      const cycle = new BackupCycle(
        t.ports,
        new Ledger(),
        scopeOf(t.settings.value),
        new AbortController().signal,
      );
      expect(await cycle.run()).toBe('complete');
    } finally {
      unsubscribe();
    }
    expect(scannedPages).toEqual([3, 3, 3, 3, 3]);
    const uploading = states.filter((state) => state.phase === 'uploading');
    expect(uploading.length).toBeGreaterThan(0);
    expect(new Set(uploading.map((state) => state.total))).toEqual(new Set([5]));
    expect(uploading[0]).toMatchObject({ total: 5, done: 0, bytesLeft: 6000 });
    expect(uploading.at(-1)).toMatchObject({ total: 5, done: 5, bytesLeft: 0 });
  });

  it('includes checkpoint gaps in the plan before the first upload without counting twice', async () => {
    const t = rig();
    t.library.pageSize = 1;
    t.library.rows = [rowOf('old', 5000), rowOf('late', 100), rowOf('new', 6000)];
    const ledger = new Ledger({
      version: 2,
      lastSeen: 5000,
      entries: [
        {
          localId: 'old',
          sha256: digestOf('old@5000'),
          bytes: 1000,
          modificationTime: 5000,
          uploadedAt: '2026-11-06T10:00:00.000Z',
          itemId: ITEM_ID,
        },
      ],
    });
    const totals: number[] = [];
    const start = t.upload.start;
    vi.spyOn(t.upload, 'start').mockImplementation((request) => {
      totals.push(backupStatus.get().total);
      expect(t.library.pagesRead).toBe(5);
      return start(request);
    });
    const cycle = new BackupCycle(
      t.ports,
      ledger,
      scopeOf(t.settings.value),
      new AbortController().signal,
    );
    expect(await cycle.run()).toBe('complete');
    expect(t.upload.started.map((request) => request.uri)).toEqual(['late', 'new']);
    expect(totals).toEqual([2, 2]);
    expect(ledger.lastSeen).toBe(6000);
  });

  it('does not hash, upload or advance the checkpoint when the scan is cancelled', async () => {
    const t = rig();
    t.library.rows = [rowOf('first', 1000), rowOf('second', 2000)];
    t.library.pageSize = 1;
    const controller = new AbortController();
    const statMedia = t.native.statMedia.bind(t.native);
    vi.spyOn(t.native, 'statMedia').mockImplementation((ids) => {
      controller.abort();
      return statMedia(ids);
    });
    const ledger = new Ledger();
    const cycle = new BackupCycle(t.ports, ledger, scopeOf(t.settings.value), controller.signal);
    expect(await cycle.run()).toBe('interrupted');
    expect(t.library.pagesRead).toBe(1);
    expect(t.native.hashed).toEqual([]);
    expect(t.upload.started).toEqual([]);
    expect(ledger.lastSeen).toBe(0);
    expect(t.storage.values.size).toBe(0);
  });

  it('plans a repeated media identity only once across scan pages', async () => {
    const t = rig();
    t.library.rows = [rowOf('same', 1000), rowOf('same', 1000), rowOf('other', 2000)];
    t.library.pageSize = 1;
    const cycle = new BackupCycle(
      t.ports,
      new Ledger(),
      scopeOf(t.settings.value),
      new AbortController().signal,
    );
    expect(await cycle.run()).toBe('complete');
    expect(t.native.hashed).toEqual(['same', 'other']);
    expect(t.upload.started.map((request) => request.uri)).toEqual(['same', 'other']);
    expect(backupStatus.get()).toMatchObject({ total: 2, done: 2, bytesLeft: 0 });
  });
});
