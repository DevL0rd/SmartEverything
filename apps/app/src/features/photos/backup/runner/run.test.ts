import { beforeEach, describe, expect, it } from 'vitest';
import type { Ledger } from '../model/ledger';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { LEDGER_STORAGE_KEY, loadLedger } from './ledger-store';
import { digestOf, ITEM_ID, rig, rowOf, type Rig } from './fixtures';
import { BackupRunner } from './runner';

describe('backup runner', () => {
  let t: Rig;

  beforeEach(() => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = rig();
  });

  async function ledger(): Promise<Ledger> {
    return loadLedger(t.storage);
  }

  it('registers the phone and uploads new items oldest first into their month folder', async () => {
    t.library.rows = [rowOf('b', 3000), rowOf('a', 1000), rowOf('c', 2000)];
    await t.runner.request();
    expect(t.hub.registered).toHaveLength(1);
    expect(t.hub.registered[0]?.deviceId).toBe('phone-1');
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'c', 'b']);
    expect(t.upload.started[0]).toMatchObject({
      identity: 'a|1000',
      name: 'a.jpg',
      mimeType: 'image/jpeg',
      bytes: 1000,
      sha256: digestOf('a@1000'),
    });
    expect(t.hub.targets[0]).toBe('1970-01-01T00:00:01.000Z');
    const stored = await ledger();
    expect(
      stored
        .uploaded()
        .map((entry) => entry.localId)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
    expect(stored.find('a')?.itemId).toBe(ITEM_ID);
    expect(stored.lastSeen).toBe(3000);
    expect(backupStatus.get()).toMatchObject({
      phase: 'idle',
      total: 3,
      done: 3,
      failed: 0,
      bytesLeft: 0,
      lastBackupAt: '2026-11-07T10:00:00.000Z',
    });
  });

  it('does not hash or upload items the ledger already holds', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    await t.runner.request();
    t.native.hashed = [];
    t.upload.started.length = 0;
    t.library.rows.push(rowOf('c', 3000));
    await new BackupRunner(t.ports).request();
    expect(t.native.hashed).toEqual(['c']);
    expect(t.upload.started.map((request) => request.uri)).toEqual(['c']);
  });

  it('skips the upload when the hub already has the content', async () => {
    t.library.rows = [rowOf('a', 1000)];
    t.hub.held.add(digestOf('a@1000'));
    await t.runner.request();
    expect(t.upload.started).toHaveLength(0);
    expect((await ledger()).find('a')?.uploadedAt).toBe('2026-11-07T10:00:00.000Z');
    expect((await ledger()).find('a')?.itemId).toBe(ITEM_ID);
    expect(t.hub.checkPurposes).toEqual(['backup']);
    expect(backupStatus.get().done).toBe(1);
  });

  it('retains canonical identity from an already-have upload outcome', async () => {
    t.library.rows = [rowOf('a', 1000)];
    t.upload.answers.set('a', { kind: 'already-have', itemId: ITEM_ID });
    await t.runner.request();
    expect((await ledger()).find('a')?.itemId).toBe(ITEM_ID);
  });

  it('reconciles migrated identities below the scan checkpoint without counting or uploading', async () => {
    t.library.rows = [rowOf('a', 1000)];
    const uploadedAt = '2026-11-06T10:00:00.000Z';
    t.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastSeen: 5000,
        entries: [
          {
            localId: 'a',
            sha256: digestOf('a@1000'),
            bytes: 1000,
            modificationTime: 1000,
            uploadedAt,
          },
        ],
      }),
    );
    t.hub.held.add(digestOf('a@1000'));
    await t.runner.request();
    expect(t.native.hashed).toEqual([]);
    expect(t.upload.started).toEqual([]);
    expect((await ledger()).find('a')).toMatchObject({ itemId: ITEM_ID, uploadedAt });
    expect((await ledger()).lastSeen).toBe(5000);
    expect(t.hub.checkPurposes).toEqual(['lookup']);
    expect(backupStatus.get()).toMatchObject({ done: 0, total: 0, bytesLeft: 0 });
    t.hub.checks.length = 0;
    await new BackupRunner(t.ports).request();
    expect(t.hub.checks).toEqual([]);
  });

  it('keeps migrated uploaded knowledge when its canonical identity is not yet available', async () => {
    t.library.rows = [rowOf('a', 1000)];
    const uploadedAt = '2026-11-06T10:00:00.000Z';
    t.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastSeen: 5000,
        entries: [
          {
            localId: 'a',
            sha256: digestOf('a@1000'),
            bytes: 1000,
            modificationTime: 1000,
            uploadedAt,
          },
        ],
      }),
    );
    await t.runner.request();
    expect((await ledger()).find('a')).toMatchObject({ itemId: null, uploadedAt });
    expect(t.upload.started).toEqual([]);
    t.hub.held.add(digestOf('a@1000'));
    await t.runner.request();
    expect((await ledger()).find('a')?.itemId).toBe(ITEM_ID);
    expect(t.upload.started).toEqual([]);
    expect(backupStatus.get()).toMatchObject({ done: 0, total: 0 });
  });

  it('uploads an edited item again under its new identity', async () => {
    t.library.rows = [rowOf('a', 1000)];
    await t.runner.request();
    t.library.rows = [rowOf('a', 5000)];
    await t.runner.request();
    expect(t.upload.started.map((request) => request.identity)).toEqual(['a|1000', 'a|5000']);
  });

  it('forgets items that left the phone', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    await t.runner.request();
    t.library.rows = [rowOf('b', 2000)];
    await t.runner.request();
    expect((await ledger()).has('a')).toBe(false);
    expect((await ledger()).has('b')).toBe(true);
  });

  it('leaves videos out when they are switched off', async () => {
    t.settings.value = { ...t.settings.value, includeVideos: false };
    t.library.rows = [rowOf('a', 1000), rowOf('v', 2000, 'video')];
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a']);
  });

  it('retries an unreadable item next time without holding back the others', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000), rowOf('c', 3000)];
    t.native.unreadable.add('b');
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'c']);
    expect(backupStatus.get().failed).toBe(1);
    expect((await ledger()).lastSeen).toBe(0);
    t.native.unreadable.clear();
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'c', 'b']);
    expect((await ledger()).lastSeen).toBe(3000);
    expect(backupStatus.get().failed).toBe(0);
  });

  it('waits for an item still being written and picks it up later', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    t.native.pending.add('b');
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a']);
    t.native.pending.clear();
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'b']);
  });

  it('never uploads an item that is in the trash', async () => {
    t.library.rows = [rowOf('a', 1000)];
    t.native.trashed.add('a');
    await t.runner.request();
    expect(t.upload.started).toHaveLength(0);
    expect(backupStatus.get().failed).toBe(0);
  });

  it('finds an item the time scan missed by comparing the id set', async () => {
    t.library.rows = [rowOf('a', 5000)];
    await t.runner.request();
    t.library.rows.push(rowOf('late', 100));
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'late']);
    expect((await ledger()).has('late')).toBe(true);
  });

  it('stops the run when the server refuses uploads and reports why', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    t.upload.answers.set('a', { kind: 'failed', failure: { kind: 'over-quota' } });
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a']);
    expect(backupStatus.get()).toMatchObject({ phase: 'idle', problem: 'over-quota' });
  });

  it('keeps going after a rejection that only concerns one item', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    t.upload.answers.set('a', {
      kind: 'failed',
      failure: { kind: 'rejected', status: 422, message: 'bad file' },
    });
    await t.runner.request();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'b']);
    expect(backupStatus.get().failed).toBe(1);
  });

  it('reports a hub failure instead of throwing and registers again next time', async () => {
    t.library.rows = [rowOf('a', 1000)];
    t.hub.registerError = new Error('hub offline');
    await t.runner.request();
    expect(backupStatus.get()).toMatchObject({ phase: 'idle', problem: 'hub offline' });
    t.hub.registerError = null;
    await t.runner.request();
    expect(t.upload.started).toHaveLength(1);
    expect(backupStatus.get().problem).toBeNull();
  });

  it('registers again only when the settings change', async () => {
    t.library.rows = [rowOf('a', 1000)];
    await t.runner.request();
    await t.runner.request();
    expect(t.hub.registered).toHaveLength(1);
    t.settings.value = { ...t.settings.value, wifiOnly: false };
    await t.runner.request();
    expect(t.hub.registered).toHaveLength(2);
    expect(t.hub.registered[1]?.settings.wifiOnly).toBe(false);
  });

  it('survives a restart with the ledger in storage', async () => {
    t.library.rows = [rowOf('a', 1000)];
    await t.runner.request();
    expect(t.storage.values.has(LEDGER_STORAGE_KEY)).toBe(true);
    t.native.hashed = [];
    await new BackupRunner(t.ports).request();
    expect(t.native.hashed).toEqual([]);
  });

  it('discards a ledger it cannot read and starts again', async () => {
    t.storage.values.set(LEDGER_STORAGE_KEY, '{not json');
    t.library.rows = [rowOf('a', 1000)];
    await t.runner.request();
    expect(t.upload.started).toHaveLength(1);
  });
});

describe('backup runner states', () => {
  let t: Rig;

  beforeEach(() => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = rig();
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
  });

  it('does nothing and says so on a runtime without the native modules', async () => {
    t.available = false;
    await t.runner.request();
    expect(backupStatus.get().phase).toBe('unavailable');
    expect(t.hub.registered).toHaveLength(0);
  });

  it('registers disabled settings without reading the library while backup is off', async () => {
    t.settings.value = { ...t.settings.value, enabled: false };
    await t.runner.request();
    expect(backupStatus.get().phase).toBe('off');
    expect(t.hub.registered).toHaveLength(1);
    expect(t.hub.registered[0]?.settings.enabled).toBe(false);
    expect(t.native.hashed).toEqual([]);
  });

  it('reports denied access and a limited selection', async () => {
    t.library.level = 'none';
    await t.runner.request();
    expect(backupStatus.get().phase).toBe('denied');
    t.library.level = 'limited';
    await t.runner.request();
    expect(backupStatus.get()).toMatchObject({ phase: 'idle', limitedAccess: true });
    expect(t.upload.started).toHaveLength(2);
  });

  it('waits on a metered network when Wi-Fi only is on and resumes when it ends', async () => {
    t.conditions.current = { connected: true, wifi: true, metered: true, charging: true };
    await t.runner.request();
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'wifi' });
    expect(t.upload.started).toHaveLength(0);
    t.conditions.current = { connected: true, wifi: true, metered: false, charging: true };
    await t.runner.conditionsChanged();
    expect(t.upload.started).toHaveLength(2);
    expect(backupStatus.get().phase).toBe('idle');
  });

  it('waits for the charger when charging only is on', async () => {
    t.settings.value = { ...t.settings.value, chargingOnly: true };
    t.conditions.current = { connected: true, wifi: true, metered: false, charging: false };
    await t.runner.request();
    expect(backupStatus.get().pauseReason).toBe('charging');
    t.conditions.current = { connected: true, wifi: true, metered: false, charging: true };
    await t.runner.conditionsChanged();
    expect(t.upload.started).toHaveLength(2);
  });

  it('pauses the upload in flight when the conditions turn bad and goes on after', async () => {
    t.upload.holdOpen = true;
    const running = t.runner.request();
    await until(() => t.upload.started.length === 1);
    t.conditions.current = { connected: true, wifi: true, metered: true, charging: true };
    const changed = t.runner.conditionsChanged();
    await running;
    await changed;
    expect(t.upload.paused).toEqual(['a']);
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'wifi' });
    t.upload.holdOpen = false;
    t.conditions.current = { connected: true, wifi: true, metered: false, charging: true };
    await t.runner.conditionsChanged();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'a', 'b']);
  });

  it('pauses and resumes on the user request and remembers the pause', async () => {
    await t.runner.pause();
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(t.upload.started).toHaveLength(0);
    const restarted = new BackupRunner(t.ports);
    await restarted.request();
    expect(backupStatus.get().pauseReason).toBe('user');
    await restarted.resume();
    expect(t.upload.started).toHaveLength(2);
    expect(backupStatus.get().phase).toBe('idle');
  });

  it('restarts the run with the new scope when the settings change mid-run', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('v', 2000, 'video')];
    t.upload.holdOpen = true;
    const running = t.runner.request();
    await until(() => t.upload.started.length === 1);
    t.settings.value = { ...t.settings.value, includeVideos: false };
    const changed = t.runner.settingsChanged();
    t.upload.holdOpen = false;
    t.upload.open();
    await running;
    await changed;
    expect(t.upload.started.map((request) => request.uri)).not.toContain('v');
  });
});

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await Promise.resolve();
}
