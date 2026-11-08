import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppUpdateEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { AppUpdateFolder } from '../../src/app-updates/update-folder';
import { AppUpdateWatch } from '../../src/app-updates/update-watch';
import type { LiveNotice } from '../../src/server/live';
import { captureLogs, testLogger } from '../support/logs';
import { testLayout } from '../support/test-layout';

class FakeLive {
  readonly notices: LiveNotice[] = [];
  readonly targeted: { readonly clientId: string; readonly notice: LiveNotice }[] = [];
  private waiting: { readonly count: number; readonly resolve: () => void }[] = [];

  announce(notice: LiveNotice, audience: string): void {
    expect(audience).toBe('everyone');
    this.notices.push(notice);
    this.waiting = this.waiting.filter((waiter) => {
      if (this.notices.length < waiter.count) return true;
      waiter.resolve();
      return false;
    });
  }

  toClient(clientId: string, notice: LiveNotice): void {
    this.targeted.push({ clientId, notice });
  }

  announced(count: number): Promise<void> {
    if (this.notices.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push({ count, resolve });
    });
  }
}

function entry(
  channel: 'release' | 'dev',
  createdAt: string,
  runtimeVersion = 'runtime-a',
): AppUpdateEntry {
  return {
    id: randomUUID(),
    platform: 'desktop',
    channel,
    runtimeVersion,
    createdAt,
    appVersion: '1.0.0',
    notes: 'Something changed.',
    launch: null,
    files: [],
    expoClient: null,
    withdrawn: null,
  };
}

let data = '';
let folder = new AppUpdateFolder(hubLayout(tmpdir(), {}));
let live = new FakeLive();
let watch = new AppUpdateWatch(folder, live, testLogger('app-updates'));

async function publish(entries: readonly AppUpdateEntry[], file = folder.indexFile): Promise<void> {
  const next = `${file}.next`;
  await writeFile(next, JSON.stringify({ entries }));
  await rename(next, file);
}

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'hub-app-update-watch-'));
  folder = new AppUpdateFolder(await testLayout(data));
  live = new FakeLive();
  watch = new AppUpdateWatch(folder, live, testLogger('app-updates'));
});

afterEach(async () => {
  await watch.stop();
  await rm(data, { recursive: true, force: true });
});

describe('watching the app update folder', () => {
  it('sends a targeted publication only to its device', async () => {
    await watch.start();
    const target = { ...entry('release', '2026-10-25T09:00:00Z'), clientId: randomUUID() };
    const dev = entry('dev', '2026-10-25T09:00:00Z');
    await publish([target], folder.targetedIndexFile);
    await publish([dev]);
    await live.announced(1);
    expect(live.notices).toEqual([expect.objectContaining({ id: dev.id })]);
    expect(live.targeted).toMatchObject([{ clientId: target.clientId, notice: { id: target.id } }]);
  });
  it('creates the folder and announces nothing at start', async () => {
    await watch.start();
    expect((await stat(folder.directory)).isDirectory()).toBe(true);
    expect(live.notices).toStrictEqual([]);
  });

  it('announces each changed channel once and leaves unchanged ones quiet', async () => {
    await watch.start();
    const release = entry('release', '2026-10-25T08:00:00Z');
    await publish([release]);
    await live.announced(1);
    const dev = entry('dev', '2026-10-25T09:00:00Z');
    await publish([release, dev]);
    await live.announced(2);
    const newerRelease = entry('release', '2026-10-25T10:00:00Z');
    await publish([release, dev, newerRelease]);
    await live.announced(3);
    expect(live.notices).toStrictEqual([
      {
        type: 'app_update',
        platform: 'desktop',
        channel: 'release',
        runtimeVersion: 'runtime-a',
        id: release.id,
      },
      {
        type: 'app_update',
        platform: 'desktop',
        channel: 'dev',
        runtimeVersion: 'runtime-a',
        id: dev.id,
      },
      {
        type: 'app_update',
        platform: 'desktop',
        channel: 'release',
        runtimeVersion: 'runtime-a',
        id: newerRelease.id,
      },
    ]);
  });

  it('treats the entries present at start as already known', async () => {
    const known = entry('release', '2026-10-25T08:00:00Z');
    await mkdir(folder.directory, { recursive: true });
    await writeFile(folder.indexFile, JSON.stringify({ entries: [known] }));
    await watch.start();
    const other = entry('dev', '2026-10-25T09:00:00Z', 'runtime-b');
    await publish([known, other]);
    await live.announced(1);
    expect(live.notices).toStrictEqual([
      {
        type: 'app_update',
        platform: 'desktop',
        channel: 'dev',
        runtimeVersion: 'runtime-b',
        id: other.id,
      },
    ]);
  });

  it('announces a target whose last live update was withdrawn and leaves the others quiet', async () => {
    await watch.start();
    const release = entry('release', '2026-10-25T08:00:00Z');
    const dev = entry('dev', '2026-10-25T09:00:00Z');
    await publish([release, dev]);
    await live.announced(2);
    const withdrawn: AppUpdateEntry = {
      ...release,
      withdrawn: { at: '2026-10-25T10:00:00Z', reason: 'Bad bundle.' },
    };
    await publish([withdrawn, dev]);
    await live.announced(3);
    expect(live.notices.slice(2)).toStrictEqual([
      {
        type: 'app_update',
        platform: 'desktop',
        channel: 'release',
        runtimeVersion: 'runtime-a',
        id: null,
      },
    ]);
  });

  it('logs an index that cannot be read and keeps what it knew', async () => {
    const logs = captureLogs();
    await watch.start();
    const first = entry('release', '2026-10-25T08:00:00Z');
    await publish([first]);
    await live.announced(1);
    await writeFile(join(folder.directory, 'index.json.next'), '{nope');
    await rename(join(folder.directory, 'index.json.next'), folder.indexFile);
    const second = entry('dev', '2026-10-25T09:00:00Z');
    await publish([first, second]);
    await live.announced(2);
    expect(logs.events()).toContain('app_update.index_invalid');
    expect(live.notices).toHaveLength(2);
  });
});
