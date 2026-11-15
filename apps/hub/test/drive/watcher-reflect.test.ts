import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveActivity } from '../../src/drive/activity';
import { fileDraft, folderDraft, type NewItem } from '../../src/drive/changes';
import { DriveWatchers, systemWatch } from '../../src/drive/watcher';
import { DriveInodesRepository } from '../../src/store/repositories/drive-inodes';
import { testLogger } from '../support/logs';
import { driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000004';
const SETTLE_MS = 40;

let root = '';
let fixture: DriveFixture;
let mounted: boolean;
let requests: string[];
let waiter: (() => void) | undefined;
let watchers: DriveWatchers | undefined;
let activity: DriveActivity;
let placementListeners: ((rootId: string) => void)[];
let mountedReads: number;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'watcher-reflect-'));
  fixture = openDriveFixture();
  mounted = false;
  requests = [];
  waiter = undefined;
  watchers = undefined;
  activity = new DriveActivity();
  placementListeners = [];
  mountedReads = 0;
});

function asked(request: string): void {
  requests.push(request);
  waiter?.();
}

function placementChanged(rootId: string): void {
  for (const listener of placementListeners) listener(rootId);
}

afterEach(() => {
  watchers?.close();
  fixture.database.close();
  rmSync(root, { recursive: true, force: true });
});

function start(): void {
  fixture.addDrive(driveRoot(ROOT), root);
  watchers = new DriveWatchers({
    roots: fixture.roots,
    index: { items: fixture.items, inodes: new DriveInodesRepository(fixture.context) },
    activity,
    mounted: (): boolean => {
      mountedReads += 1;
      return mounted;
    },
    onPlacementChange: (listener): (() => void) => {
      placementListeners.push(listener);
      return (): void => {
        placementListeners = placementListeners.filter((kept) => kept !== listener);
      };
    },
    enqueueScan: (): void => {
      asked('scan');
    },
    enqueueFollowUps: (): void => {
      asked('follow-ups');
    },
    watch: systemWatch,
    settleMs: SETTLE_MS,
    log: testLogger(),
  });
  watchers.start(fixture.roots.byId(ROOT));
  requests.splice(0);
}

function parentIdOf(relPath: string): string | null {
  const slash = relPath.lastIndexOf('/');
  if (slash === -1) return null;
  const parent = fixture.items.byPath(ROOT, relPath.slice(0, slash), null);
  if (parent === undefined) throw new Error(`The parent of ${relPath} is not indexed.`);
  return parent.id;
}

function indexAsHub(relPath: string): string {
  const stats = lstatSync(join(root, relPath), { bigint: true });
  const item: NewItem = {
    rootId: ROOT,
    parentId: parentIdOf(relPath),
    relPath,
    modifiedAt: new Date(Number(stats.mtimeMs)).toISOString(),
    addedAt: NOW,
    outside: false,
    addedByProfileId: null,
  };
  return fixture.items.write({
    item: stats.isDirectory()
      ? folderDraft(item, 0)
      : fileDraft(item, { bytes: Number(stats.size), sha256: null }),
    identity: { dev: stats.dev.toString(), ino: stats.ino.toString() },
    inode: { mode: Number(stats.mode & 0o7777n) },
  }).item.id;
}

function nextRequest(): Promise<string> {
  const seen = requests.length;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('the watcher asked for nothing'));
    }, 5000);
    const check = (): void => {
      const request = requests[seen];
      if (request === undefined) return;
      clearTimeout(timer);
      waiter = undefined;
      resolve(request);
    };
    waiter = check;
    check();
  });
}

describe('the watcher after a change the hub made itself', () => {
  it('asks only for the follow-up jobs when every touched item already matches the index', async () => {
    start();
    mkdirSync(join(root, 'made'));
    writeFileSync(join(root, 'made/one.txt'), 'one');
    writeFileSync(join(root, 'top.txt'), 'top');
    indexAsHub('made');
    indexAsHub('made/one.txt');
    indexAsHub('top.txt');
    await expect(nextRequest()).resolves.toBe('follow-ups');
    const id = fixture.items.byPath(ROOT, 'top.txt', null)?.id;
    if (id === undefined) throw new Error('top.txt is not indexed');
    rmSync(join(root, 'top.txt'));
    fixture.items.remove(id);
    await expect(nextRequest()).resolves.toBe('follow-ups');
    expect(requests).toEqual(['follow-ups', 'follow-ups']);
  });

  it('waits for a running hub operation to finish before judging what it touched', async () => {
    start();
    await activity.around(async () => {
      writeFileSync(join(root, 'slow.txt'), 'slow');
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS * 4));
      expect(requests).toEqual([]);
      indexAsHub('slow.txt');
    });
    await expect(nextRequest()).resolves.toBe('follow-ups');
    expect(requests).toEqual(['follow-ups']);
  });

  it('scans the root for a change the index does not hold', async () => {
    mkdirSync(join(root, 'kept'));
    start();
    writeFileSync(join(root, 'kept/outside.txt'), 'outside');
    await expect(nextRequest()).resolves.toBe('scan');
  });

  it('scans for an item that changed again after the hub indexed it', async () => {
    start();
    writeFileSync(join(root, 'doc.txt'), 'one');
    indexAsHub('doc.txt');
    await expect(nextRequest()).resolves.toBe('follow-ups');
    writeFileSync(join(root, 'doc.txt'), 'one and more');
    await expect(nextRequest()).resolves.toBe('scan');
  });

  it('checks what a new folder already held when its watch was attached', async () => {
    start();
    mkdirSync(join(root, 'fresh'));
    writeFileSync(join(root, 'fresh/early.txt'), 'early');
    indexAsHub('fresh');
    await expect(nextRequest()).resolves.toBe('scan');
  });

  it('ignores the orphan folder and checks hidden names while the drive is mounted', async () => {
    mounted = true;
    start();
    mkdirSync(join(root, '.se-orphans'));
    writeFileSync(join(root, '.se-orphans/7'), 'held open');
    writeFileSync(join(root, '.hidden'), 'hidden');
    indexAsHub('.hidden');
    await expect(nextRequest()).resolves.toBe('follow-ups');
    writeFileSync(join(root, '.other'), 'other');
    await expect(nextRequest()).resolves.toBe('scan');
  });

  it('reads the mount state once and again only when a placement of its root changes', async () => {
    start();
    writeFileSync(join(root, 'a.txt'), 'a');
    writeFileSync(join(root, 'b.txt'), 'b');
    indexAsHub('a.txt');
    indexAsHub('b.txt');
    await expect(nextRequest()).resolves.toBe('follow-ups');
    expect(mountedReads).toBe(1);
    placementChanged('another-root');
    expect(mountedReads).toBe(1);
    mounted = true;
    placementChanged(ROOT);
    expect(mountedReads).toBe(2);
    writeFileSync(join(root, '.later'), 'later');
    await expect(nextRequest()).resolves.toBe('scan');
  });

  it('stops listening for placement changes once the watch closes', () => {
    start();
    expect(placementListeners).toHaveLength(1);
    watchers?.close();
    expect(placementListeners).toHaveLength(0);
  });
});
