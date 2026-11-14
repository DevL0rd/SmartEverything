import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncTarget, SyncWaiting } from '../../src/drive-sync/service.js';
import { SyncEngineHost, type EngineHandle } from '../../src/drive-mount/sync-engines.js';

function target(id: string): SyncTarget {
  return {
    placementId: id,
    driveId: 'drive',
    localPath: `/data/${id}`,
    excluded: [],
    ignorePatterns: [],
    receiveOnly: false,
  };
}

function handle(calls: string[], name: string, need = 0, failures = 0): EngineHandle {
  return {
    start: (): Promise<void> => {
      calls.push(`start ${name}`);
      return Promise.resolve();
    },
    stop: (): Promise<void> => {
      calls.push(`stop ${name}`);
      return Promise.resolve();
    },
    pause: (): Promise<void> => {
      calls.push(`pause ${name}`);
      return Promise.resolve();
    },
    resume: (): Promise<void> => {
      calls.push(`resume ${name}`);
      return Promise.resolve();
    },
    waiting: (): Promise<SyncWaiting> =>
      Promise.resolve({ needBytes: need, pendingOps: need > 0 ? 1 : 0 }),
    failures: (): number => failures,
  };
}

function host(
  calls: string[],
  needs: Record<string, number> = {},
): { readonly created: SyncEngineHost; readonly changes: (() => void)[] } {
  const changes: (() => void)[] = [];
  const created = new SyncEngineHost({
    create: (next, changed): EngineHandle => {
      changes.push(changed);
      return handle(calls, next.placementId, needs[next.placementId] ?? 0);
    },
    prepare: (next): Promise<void> => {
      calls.push(`prepare ${next.placementId}`);
      return Promise.resolve();
    },
    quietMs: 5,
    log: new Logger('desktop.test'),
  });
  return { created, changes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncEngineHost', () => {
  it('prepares the folder, starts the engine and reports its waiting work', async () => {
    const calls: string[] = [];
    const { created } = host(calls, { a: 4096 });
    await created.start(target('a'));
    expect(calls).toEqual(['prepare a', 'start a']);
    expect(await created.waiting('a')).toEqual({ needBytes: 4096, pendingOps: 1 });
    expect(await created.waiting('missing')).toEqual({ needBytes: 0, pendingOps: 0 });
    expect(await created.summary()).toEqual({
      placements: 1,
      paused: false,
      needBytes: 4096,
      pendingOps: 1,
      failures: 0,
    });
  });

  it('has no summary without placements and stops engines it knows', async () => {
    const calls: string[] = [];
    const { created } = host(calls);
    expect(await created.summary()).toBeNull();
    await created.start(target('a'));
    await created.stop('a');
    await created.stop('a');
    expect(calls.filter((call) => call === 'stop a')).toHaveLength(1);
    expect(await created.summary()).toBeNull();
  });

  it('pauses every engine, keeps newly started ones paused and resumes them all', async () => {
    const calls: string[] = [];
    const { created } = host(calls);
    await created.start(target('a'));
    await created.pause();
    await created.start(target('b'));
    expect(calls).toContain('pause a');
    expect(calls).toContain('pause b');
    expect((await created.summary())?.paused).toBe(true);
    await created.resume();
    expect(calls).toContain('resume a');
    expect(calls).toContain('resume b');
    expect((await created.summary())?.paused).toBe(false);
  });

  it('keeps going when one engine fails to pause', async () => {
    const calls: string[] = [];
    const failing = new SyncEngineHost({
      create: (next): EngineHandle => ({
        ...handle(calls, next.placementId),
        pause: (): Promise<void> => Promise.reject(new Error('stuck')),
      }),
      prepare: (): Promise<void> => Promise.resolve(),
      quietMs: 5,
      log: new Logger('desktop.test'),
    });
    await failing.start(target('a'));
    await expect(failing.pause()).resolves.toBeUndefined();
  });

  it('coalesces change notifications', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const { created, changes } = host(calls);
    const listener = vi.fn();
    created.onChange(listener);
    await created.start(target('a'));
    changes[0]?.();
    changes[0]?.();
    changes[0]?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('stops everything on close', async () => {
    const calls: string[] = [];
    const { created } = host(calls);
    await created.start(target('a'));
    await created.start(target('b'));
    await created.close();
    expect(calls).toContain('stop a');
    expect(calls).toContain('stop b');
  });
});
