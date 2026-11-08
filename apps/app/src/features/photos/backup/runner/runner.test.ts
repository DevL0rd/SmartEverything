import { beforeEach, describe, expect, it } from 'vitest';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { deferred } from './deferred-fixture';
import { rig, rowOf } from './fixtures';
import { PAUSED_STORAGE_KEY } from './ledger-store';
import { BackupRunner } from './runner';

beforeEach(() => {
  backupStatus.set(INITIAL_BACKUP_STATUS);
});

describe('backup pause ownership', () => {
  it('does not overwrite a user pause with a stale startup storage read', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<null>();
    const stored = deferred<string | null>();
    const runner = new BackupRunner({
      ...t.ports,
      storage: {
        getItem(key): Promise<string | null> {
          if (key !== PAUSED_STORAGE_KEY) return t.storage.getItem(key);
          entered.resolve(null);
          return stored.promise;
        },
        setItem: (key, value): Promise<void> => t.storage.setItem(key, value),
      },
    });
    const running = runner.request();
    await entered.promise;
    const paused = runner.pause();
    stored.resolve('false');
    await Promise.all([running, paused]);
    expect(t.upload.started).toEqual([]);
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(t.storage.values.get(PAUSED_STORAGE_KEY)).toBe('true');
  });

  it('aborts hashing immediately without waiting for pause persistence', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<AbortSignal | undefined>();
    const hashed = deferred<null>();
    const saved = deferred<null>();
    const runner = new BackupRunner({
      ...t.ports,
      storage: {
        getItem: (key): Promise<string | null> => t.storage.getItem(key),
        async setItem(key, value): Promise<void> {
          if (key === PAUSED_STORAGE_KEY) await saved.promise;
          await t.storage.setItem(key, value);
        },
      },
      native: {
        statMedia: (ids, signal): ReturnType<typeof t.ports.native.statMedia> =>
          t.ports.native.statMedia(ids, signal),
        async hashFile(uri, signal): ReturnType<typeof t.native.hashFile> {
          entered.resolve(signal);
          await hashed.promise;
          return t.native.hashFile(uri);
        },
      },
    });
    const running = runner.request();
    const signal = await entered.promise;
    const paused = runner.pause();
    expect(signal?.aborted).toBe(true);
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    hashed.resolve(null);
    saved.resolve(null);
    await Promise.all([running, paused]);
    expect(t.upload.started).toEqual([]);
  });

  it('keeps a user pause across conditions, settings and foreground triggers', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    await t.runner.pause();
    await Promise.all([
      t.runner.request(),
      t.runner.conditionsChanged(),
      t.runner.settingsChanged(),
      t.runner.request(),
    ]);
    expect(t.native.hashed).toEqual([]);
    expect(t.upload.started).toEqual([]);
    expect(backupStatus.get()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    await t.runner.resume();
    expect(t.upload.started.map((request) => request.uri)).toEqual(['photo']);
  });

  it('keeps the pause control paused when device registration fails', async () => {
    const t = rig();
    t.hub.registerError = new Error('hub offline');
    await t.runner.pause();
    expect(backupStatus.get()).toMatchObject({
      phase: 'paused',
      pauseReason: 'user',
      problem: 'hub offline',
    });
    await t.runner.conditionsChanged();
    expect(backupStatus.get().pauseReason).toBe('user');
  });

  it('persists rapid pause and resume in intent order and waits on stop', async () => {
    const t = rig();
    const first = deferred<null>();
    const second = deferred<null>();
    const firstEntered = deferred<null>();
    const secondEntered = deferred<null>();
    const writes: string[] = [];
    const runner = new BackupRunner({
      ...t.ports,
      storage: {
        getItem: (key): Promise<string | null> => t.storage.getItem(key),
        async setItem(key, value): Promise<void> {
          if (key === PAUSED_STORAGE_KEY) {
            writes.push(value);
            if (writes.length === 1) {
              firstEntered.resolve(null);
              await first.promise;
            } else {
              secondEntered.resolve(null);
              await second.promise;
            }
          }
          await t.storage.setItem(key, value);
        },
      },
    });
    const paused = runner.pause();
    const resumed = runner.resume();
    await firstEntered.promise;
    expect(writes).toEqual(['true']);
    first.resolve(null);
    await secondEntered.promise;
    let stopped = false;
    const stopping = runner.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    second.resolve(null);
    await Promise.all([paused, resumed, stopping]);
    expect(writes).toEqual(['true', 'false']);
    expect(t.storage.values.get(PAUSED_STORAGE_KEY)).toBe('false');
  });
});
