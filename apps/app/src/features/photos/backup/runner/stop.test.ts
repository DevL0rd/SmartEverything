import { deferred } from './deferred-fixture';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { BackupRunner } from './runner';
import { rig, rowOf } from './fixtures';

beforeEach(() => {
  backupStatus.set(INITIAL_BACKUP_STATUS);
});

describe('terminal backup cancellation', () => {
  it('propagates abort to native hashing and cannot restart after stop', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<AbortSignal | undefined>();
    const release = deferred<null>();
    const runner = new BackupRunner({
      ...t.ports,
      native: {
        statMedia: (ids): ReturnType<typeof t.native.statMedia> => t.native.statMedia(ids),
        async hashFile(uri, signal): ReturnType<typeof t.native.hashFile> {
          entered.resolve(signal);
          await release.promise;
          return t.native.hashFile(uri);
        },
      },
    });
    const running = runner.request();
    const signal = await entered.promise;
    const stopped = runner.stop();
    expect(signal?.aborted).toBe(true);
    backupStatus.set(INITIAL_BACKUP_STATUS);
    release.resolve(null);
    await Promise.all([running, stopped]);
    await runner.request();
    await runner.resume();
    expect(t.upload.started).toHaveLength(0);
    expect(t.storage.values.size).toBe(0);
    expect(backupStatus.get()).toEqual(INITIAL_BACKUP_STATUS);
  });

  it('passes its terminal lifetime to a free-up enumeration and stops after the current page', async () => {
    const t = rig();
    const entered = deferred<AbortSignal | undefined>();
    const release = deferred<null>();
    let pages = 0;
    const runner = new BackupRunner({
      ...t.ports,
      media: {
        ...t.ports.media,
        access: (): ReturnType<typeof t.library.access> => t.library.access(),
        requestAccess: (): ReturnType<typeof t.library.requestAccess> => t.library.requestAccess(),
        presentPicker: (): ReturnType<typeof t.library.presentPicker> => t.library.presentPicker(),
        listIds: (scope, signal): ReturnType<typeof t.ports.media.listIds> =>
          t.ports.media.listIds(scope, signal),
        onChange: (listener): (() => void) => t.library.onChange(listener),
        remove: (ids): Promise<boolean> => t.library.remove(ids),
        async *pagesFrom(
          _scope,
          _from,
          signal,
        ): AsyncGenerator<readonly ReturnType<typeof rowOf>[]> {
          entered.resolve(signal);
          await release.promise;
          pages += 1;
          yield [rowOf('first', 1000)];
          pages += 1;
          yield [rowOf('second', 2000)];
        },
      },
    });
    const finding = runner.findFreeable();
    const signal = await entered.promise;
    await runner.stop();
    release.resolve(null);
    expect(await finding).toEqual({ kind: 'unsupported' });
    expect(signal?.aborted).toBe(true);
    expect(pages).toBe(1);
    expect(t.library.removed).toEqual([]);
  });

  it('does not start an upload after a cancelled target resolution completes', async () => {
    const t = rig();
    t.library.rows = [rowOf('photo', 1000)];
    const entered = deferred<null>();
    const target = deferred<{ readonly folderId: string }>();
    t.hub.resolveTarget = (): Promise<{ readonly folderId: string }> => {
      entered.resolve(null);
      return target.promise;
    };
    const running = t.runner.request();
    await entered.promise;
    const stopped = t.runner.stop();
    backupStatus.set(INITIAL_BACKUP_STATUS);
    target.resolve({ folderId: 'unused' });
    await Promise.all([running, stopped]);
    expect(t.upload.started).toHaveLength(0);
    expect(backupStatus.get()).toEqual(INITIAL_BACKUP_STATUS);
  });
});
