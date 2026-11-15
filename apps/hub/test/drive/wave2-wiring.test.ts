import { access, mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  DRIVE_CONTENT_ENDPOINTS,
  DRIVE_SOCIAL_ENDPOINTS,
  MEDIA_PATHS,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { systemDataSpace } from '../../src/drive/data-space';
import { orphanRelPath } from '../../src/drive/intents';
import { ensureDrives } from '../../src/drive/spaces';
import { PushCommandChannel } from '../../src/extensions/push/commands';
import { driveExtraRoutes, driveRoutes } from '../../src/server/handlers/drive';
import { driveRawRoutes } from '../../src/server/handlers/drive-raw-routes';
import { UploadSweeper } from '../../src/server/handlers/drive-upload-sweep';
import { startDrive, type RunningDrive } from '../../src/server/handlers/drive-start';
import { createDrive, type DriveDeps } from '../../src/server/handlers/drive-wiring';
import { WorkQueue } from '../../src/drive/work-queue';
import { MediaLinks } from '../../src/server/media-links';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const TEXT_JOB = z.object({ kind: z.literal('text'), rootId: z.string() });

const NOW = new Date('2026-11-07T00:00:00.000Z');
const log = testLogger('drive-wave2');

let opened: TestStore;
let second: DatabaseSync;
let deps: DriveDeps;

function depsOf(store: TestStore['store']): DriveDeps {
  return {
    store,
    parts: {
      context: new StoreContext(new Sql(second), new ChangeFeed(log), () => NOW),
      database: second,
      conflicts: {
        insert: (): void => undefined,
        find: (): undefined => undefined,
        resolve: (): never => {
          throw new Error('no conflicts in this rig');
        },
      },
      listings: {
        shares: () => ({ items: [], next: null }),
        duplicates: () => ({ items: [], next: null }),
        conflicts: () => ({ items: [], next: null }),
      },
      removeLocationOutside: () => true,
      notifyCorruption: (): void => undefined,
    },
    layout: opened.layout,
    localUrl: () => 'http://hub.local:8080',
    links: new MediaLinks(() => NOW),
    nodes: new ComputerNodeAccess(store, () => NOW),
    pushCommands: new PushCommandChannel(),
    probe: systemDataSpace,
    now: () => NOW,
    log,
    watchSettleMs: 10,
    scannerScript: join(opened.directory, 'unused-scanner.mjs'),
    hasherScript: join(opened.directory, 'unused-hasher.mjs'),
    contentScript: join(opened.directory, 'unused-content.mjs'),
  };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => NOW);
  second = new DatabaseSync(join(opened.directory, 'test.db'));
  deps = depsOf(opened.store);
});

afterEach(async () => {
  second.close();
  await opened.close();
});

describe('the Drive wave 2 routes', () => {
  it('has a handler for every content and social endpoint and no other', () => {
    const runtime = createDrive(deps);
    const routed = Object.keys(driveExtraRoutes(opened.store, runtime.extras)).sort();
    const registered = [
      ...Object.keys(DRIVE_CONTENT_ENDPOINTS),
      ...Object.keys(DRIVE_SOCIAL_ENDPOINTS),
    ].sort();
    expect(routed).toEqual(registered);
    const plain = Object.keys(driveRoutes(opened.store, runtime.services));
    expect(plain.filter((name) => routed.includes(name))).toEqual([]);
  });

  it('serves zip entries, folder icons and the file request page and uploads on raw routes', () => {
    const runtime = createDrive(deps);
    const sweeper = new UploadSweeper(runtime.uploads, deps.now, log);
    const routes = driveRawRoutes(deps, runtime, sweeper);
    const keys = routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        `GET ${MEDIA_PATHS.driveZipEntry}`,
        `GET ${MEDIA_PATHS.driveFolderIcon}`,
        `GET ${MEDIA_PATHS.driveFileRequest}`,
        `POST ${MEDIA_PATHS.driveFileRequest}/files`,
        `PATCH ${MEDIA_PATHS.driveFileRequest}/files/:uploadId`,
      ]),
    );
  });
});

describe('starting and stopping the Drive with wave 2 parts', () => {
  let running: RunningDrive | undefined;

  afterEach(async () => {
    await running?.stop();
    running = undefined;
  });

  it('starts every wave 2 part and stops them without leaving anything running', async () => {
    running = await startDrive(deps);
    expect(Object.keys(running.routes)).toEqual(
      expect.arrayContaining(['listComments', 'listOffline', 'openItem', 'readItemText']),
    );
    await running.stop();
    running = undefined;
  });

  it('removes the files and inodes left held open by a stopped hub when the drive starts', async () => {
    const { store } = deps;
    const [drive] = await ensureDrives(store, deps.layout, store.profiles.list());
    if (drive === undefined) throw new Error('no drive');
    const held = store.driveInodes.create({ rootId: drive.id, type: 'file' });
    store.driveInodes.setOrphan(held.id, true);
    const file = join(drive.path, orphanRelPath(held.id));
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, 'held');
    running = await startDrive(deps);
    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(store.driveInodes.find(held.id)).toBeUndefined();
  });

  it('queues a text job at start for every drive, after each metadata job and on a drive change notice', async () => {
    const enqueue = vi.spyOn(WorkQueue.prototype, 'enqueue');
    const textJobs = (): string[] =>
      enqueue.mock.calls.flatMap((call) => {
        const job: unknown = call[0];
        const text = TEXT_JOB.safeParse(job);
        return text.success ? [text.data.rootId] : [];
      });
    running = await startDrive(deps);
    const roots = deps.store.driveRoots.list().map((root) => root.id);
    expect(roots.length).toBeGreaterThan(0);
    expect(textJobs()).toEqual(expect.arrayContaining(roots));
    await running.runtime.queue.idle();

    const metadataRoot = '0d000000-0000-4000-8000-0000000000a1';
    enqueue.mockClear();
    running.runtime.queue.enqueue({ kind: 'metadata', rootId: metadataRoot });
    await running.runtime.queue.idle();
    expect(textJobs()).toContain(metadataRoot);

    const changedRoot = '0d000000-0000-4000-8000-0000000000a2';
    enqueue.mockClear();
    deps.store.feed.notice({
      type: 'drive_changed',
      rootIds: [changedRoot],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 0,
    });
    await running.runtime.queue.idle();
    expect(textJobs()).toEqual([changedRoot]);
    enqueue.mockRestore();
  });
});
