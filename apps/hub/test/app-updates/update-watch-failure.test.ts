import type * as Fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogs, testLogger } from '../support/logs';
import { testLayout } from '../support/test-layout';

const closed = vi.fn();
const failure = new Error('inotify watch limit reached');
let failing = true;

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof Fs>();
  return {
    ...original,
    watch: (...args: Parameters<typeof original.watch>): ReturnType<typeof original.watch> => {
      if (failing) throw failure;
      const watcher = original.watch(...args);
      const close = watcher.close.bind(watcher);
      watcher.close = (): void => {
        closed();
        close();
      };
      return watcher;
    },
  };
});

const { AppUpdateFolder } = await import('../../src/app-updates/update-folder');
const { AppUpdateWatch } = await import('../../src/app-updates/update-watch');

let data = '';

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'hub-app-update-watch-failure-'));
  closed.mockClear();
});

afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

describe('the app update watcher failing', () => {
  it('logs app_update.watch_failed and rethrows at start', async () => {
    failing = true;
    const logs = captureLogs();
    const watch = new AppUpdateWatch(
      new AppUpdateFolder(await testLayout(data)),
      { announce: vi.fn(), toClient: vi.fn() },
      testLogger('app-updates'),
    );
    await expect(watch.start()).rejects.toBe(failure);
    expect(logs.events().filter((event) => event === 'app_update.watch_failed')).toHaveLength(1);
  });

  it('closes the watcher on stop', async () => {
    failing = false;
    const watch = new AppUpdateWatch(
      new AppUpdateFolder(await testLayout(data)),
      { announce: vi.fn(), toClient: vi.fn() },
      testLogger('app-updates'),
    );
    await watch.start();
    await watch.stop();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
