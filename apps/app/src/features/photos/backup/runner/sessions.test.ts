import { deferred } from './deferred-fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backupHandle } from '../handle';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { rig, rowOf, type Rig } from './fixtures';
import { BackupSessions, type BackupScope } from './sessions';
import { scopedBackupStorage } from './scoped-storage';
import { attachBackupTriggers } from './triggers';

function scopeOf(t: Rig, key: string, authority: object = {}): BackupScope {
  return {
    key,
    authority,
    create: (current) => ({
      ...t.ports,
      available: () => current() && t.available,
      storage: scopedBackupStorage(t.storage, key, current),
    }),
    attach: (runner, ports) =>
      attachBackupTriggers(runner, ports, { subscribe: () => () => undefined }),
  };
}

async function idle(): Promise<void> {
  await backupHandle.get()?.runner.whenIdle();
}

beforeEach(() => {
  backupHandle.set(null);
  backupStatus.set(INITIAL_BACKUP_STATUS);
});

describe('scoped backup sessions', () => {
  it('runs a cold task without a mounted host and releases its subscriptions', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    await sessions.runBackground(() => Promise.resolve(scopeOf(t, 'home/client/person/phone')));
    expect(t.upload.started.map((entry) => entry.uri)).toEqual(['photo']);
    expect(t.library.listeners.size).toBe(0);
    expect(t.settings.listeners.size).toBe(0);
    expect(t.conditions.listeners.size).toBe(0);
    expect(backupHandle.get()).toBeNull();
  });

  it('uses the mounted foreground runner without loading another scope', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    await sessions.setForeground(scopeOf(t, 'same'));
    await idle();
    const handle = backupHandle.get();
    const load = vi.fn(() => Promise.resolve(null));
    await sessions.runBackground(load);
    expect(load).not.toHaveBeenCalled();
    expect(backupHandle.get()).toBe(handle);
    expect(t.upload.started).toHaveLength(1);
    await sessions.setForeground(null);
  });

  it('lets the foreground adopt an in-flight task for the same authority', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<null>();
    const release = deferred<null>();
    const hash = t.native.hashFile.bind(t.native);
    t.native.hashFile = async (uri): ReturnType<typeof hash> => {
      entered.resolve(null);
      await release.promise;
      return hash(uri);
    };
    const scope = scopeOf(t, 'same');
    const task = sessions.runBackground(() => Promise.resolve(scope));
    await entered.promise;
    const handle = backupHandle.get();
    await sessions.setForeground(scope);
    release.resolve(null);
    await task;
    expect(backupHandle.get()).toBe(handle);
    expect(t.upload.started).toHaveLength(1);
    expect(t.library.listeners.size).toBe(1);
    await sessions.setForeground(null);
  });

  it('replaces snapshot settings with live settings when the app opens the same phone scope', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<null>();
    const release = deferred<null>();
    const hash = t.native.hashFile.bind(t.native);
    t.native.hashFile = async (uri): ReturnType<typeof hash> => {
      entered.resolve(null);
      await release.promise;
      return hash(uri);
    };
    const authority = {};
    const task = sessions.runBackground(() => Promise.resolve(scopeOf(t, 'same', authority)));
    await entered.promise;
    const opening = sessions.setForeground(scopeOf(t, 'same', authority));
    release.resolve(null);
    await Promise.all([opening, task]);
    await idle();
    t.settings.change({ enabled: false });
    await idle();
    expect(backupStatus.get().phase).toBe('off');
    expect(t.upload.started).toHaveLength(1);
    await sessions.setForeground(null);
  });

  it('deduplicates overlapping cold task invocations', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    const load = vi.fn(() => Promise.resolve(scopeOf(t, 'cold')));
    await Promise.all([sessions.runBackground(load), sessions.runBackground(load)]);
    expect(load).toHaveBeenCalledOnce();
  });

  it('invalidates a delayed old hash before switching profiles', async () => {
    const sessions = new BackupSessions();
    const old = rig();
    const next = rig();
    old.library.rows = [rowOf('old', 1000)];
    next.library.rows = [rowOf('next', 2000)];
    const entered = deferred<null>();
    const release = deferred<null>();
    const hash = old.native.hashFile.bind(old.native);
    old.native.hashFile = async (uri): ReturnType<typeof hash> => {
      entered.resolve(null);
      await release.promise;
      return hash(uri);
    };
    await sessions.setForeground(scopeOf(old, 'old-profile'));
    await entered.promise;
    const changing = sessions.setForeground(scopeOf(next, 'next-profile'));
    expect(backupHandle.get()).toBeNull();
    expect(backupStatus.get()).toEqual(INITIAL_BACKUP_STATUS);
    release.resolve(null);
    await changing;
    await idle();
    expect(old.upload.started).toHaveLength(0);
    expect(old.library.listeners.size).toBe(0);
    expect(next.upload.started.map((entry) => entry.uri)).toEqual(['next']);
    expect(backupStatus.get().done).toBe(1);
    await sessions.setForeground(null);
  });

  it('stops an upload on signout and ignores its delayed completion', async () => {
    const sessions = new BackupSessions();
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    t.upload.holdOpen = true;
    const entered = deferred<null>();
    const start = t.upload.start;
    t.upload.start = (request): ReturnType<typeof start> => {
      const handle = start(request);
      entered.resolve(null);
      return handle;
    };
    await sessions.setForeground(scopeOf(t, 'old'));
    await entered.promise;
    await sessions.setForeground(null);
    t.upload.open();
    await Promise.resolve(null);
    expect(t.upload.paused).toEqual(['photo']);
    expect(backupStatus.get()).toEqual(INITIAL_BACKUP_STATUS);
    expect(t.library.listeners.size).toBe(0);
    expect(backupHandle.get()).toBeNull();
  });
});
