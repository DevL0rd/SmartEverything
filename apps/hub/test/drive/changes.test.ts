import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  type DriveConflict,
  type DriveConflictResolution,
  type DriveRoot,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitContent,
  finishCommitFromDisk,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
} from '../../src/drive/changes';
import {
  commitConflictCopy,
  conflictName,
  resolveConflict,
  type ConflictEnv,
} from '../../src/drive/conflicts';
import { itemFeed, rootFeed, staleCursor } from '../../src/drive/feed';
import { recoverIntents, type DriveWriteRoot } from '../../src/drive/intents';
import { ScanCommitter } from '../../src/drive/scanner-commit';
import type { WalkEntry } from '../../src/drive/scanner-walk';
import {
  commitRestore,
  commitTrash,
  MAX_TIMER_DELAY_MS,
  PurgeTimer,
  purgeDue,
} from '../../src/drive/trash-purge';
import { commitBytes, nodeFiles, stageBytes } from '../../src/drive/versions';
import { isMissing } from '../../src/fs-util';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const DAY_MS = 86_400_000;
const START = new Date('2026-11-07T00:00:00.000Z');

let opened: TestStore;
let base = '';
let dir = '';
let root: DriveWriteRoot;
let person = '';
let notices: {
  rootIds: readonly string[];
  folderIds: readonly string[];
  months: readonly string[];
  cursor: number;
}[] = [];
let purgeCalls = 0;
let conflictRows: Map<string, DriveConflict>;

function actor(via: ChangeActor['via'] = 'app'): ChangeActor {
  return via === 'sync' || via === 'mount'
    ? { actorProfileId: person, via, deviceId: randomUUID() }
    : { actorProfileId: person, via, deviceId: null };
}

function rootRow(id: string, path: string): DriveRoot {
  return {
    id,
    kind: 'folder',
    label: 'Changes root',
    scope: 'home',
    ownerProfileId: null,
    path,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: `index-${id}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: {
      hashedShare: 0,
      verifiedShare: 0,
      corrupt: 0,
      lastScrubAt: null,
      lastBackupAt: null,
    },
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

function aiImagesRoot(root: DriveRoot): Extract<DriveRoot, { kind: 'ai_images' }> {
  if (root.kind !== 'folder') {
    throw new Error('this test builds its virtual root from a folder root');
  }
  return {
    ...root,
    kind: 'ai_images',
    path: null,
    readOnly: true,
    versions: false,
    synced: false,
    sync: null,
  };
}

function env(now: () => Date = () => START): ChangeEnv {
  return {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive'),
    now,
    purge: {
      rearm: (): void => {
        purgeCalls += 1;
      },
    },
  };
}

function conflictEnv(now: () => Date = () => START): ConflictEnv {
  return {
    ...env(now),
    conflicts: {
      insert: (conflict): void => {
        conflictRows.set(conflict.id, conflict);
      },
      find: (id) => conflictRows.get(id),
      resolve: (id, resolution: DriveConflictResolution, at): DriveConflict => {
        const found = conflictRows.get(id);
        if (found === undefined) throw new Error('missing');
        const resolved = { ...found, resolution, resolvedAt: at };
        conflictRows.set(id, resolved);
        return resolved;
      },
    },
  };
}

async function write(
  text: string,
  relPath: string,
  who: ChangeActor = actor(),
  e: ChangeEnv = env(),
): ReturnType<typeof commitContent> {
  const staged = await stageBytes(e, root, Readable.from([Buffer.from(text)]));
  return commitContent(e, { root, staged, relPath, actor: who });
}

async function text(relPath: string): Promise<string | null> {
  try {
    return await readFile(join(dir, relPath), 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function walkEntry(relPath: string): Promise<WalkEntry> {
  const stats = await lstat(join(dir, relPath), { bigint: false });
  const bigint = await lstat(join(dir, relPath), { bigint: true });
  return {
    kind: 'file',
    relPath,
    name: relPath.split('/').at(-1) ?? relPath,
    parentRelPath: null,
    bytes: stats.size,
    modifiedMs: stats.mtimeMs,
    dev: bigint.dev.toString(),
    ino: bigint.ino.toString(),
  };
}

async function reconcile(relPath: string): Promise<void> {
  const committer = new ScanCommitter(
    {
      items: opened.store.driveItems,
      write: <T>(work: () => T): T => opened.store.write(work),
      now: (): Date => START,
      newId: randomUUID,
    },
    opened.store.driveRoots.byId(root.id),
  );
  committer.apply([await walkEntry(relPath)]);
  committer.finish([]);
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-changes-')));
  dir = join(base, 'root');
  await mkdir(dir);
  root = { id: randomUUID(), path: dir, readOnly: false, versions: true };
  opened.store.driveRoots.insert(rootRow(root.id, dir));
  person = opened.store.profiles.first().id;
  notices = [];
  purgeCalls = 0;
  conflictRows = new Map();
  opened.store.feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_changed') {
      notices.push(notice);
    }
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('committing bytes', () => {
  it('creates an item with rev 1, a feed row, one notice and a cleared intent', async () => {
    const result = await write('hello', 'a.txt', actor('sync'));
    expect(result.created).toBe(true);
    expect(result.item).toMatchObject({ rev: 1, bytes: 5, relPath: 'a.txt', integrity: 'ok' });
    expect(result.item.addedByProfileId).toBe(person);
    const rows = opened.store.driveFeed.sinceInRoot(root.id, 0, 10).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ op: 'create', rev: 1, via: 'sync', actorProfileId: person });
    expect(rows[0]?.deviceId).not.toBeNull();
    expect(notices).toEqual([
      {
        type: 'drive_changed',
        rootIds: [root.id],
        folderIds: [],
        albumIds: [],
        months: [],
        cursor: rows[0]?.seq,
      },
    ]);
    expect(opened.store.driveIntents.all()).toEqual([]);
    expect(purgeCalls).toBe(1);
  });

  it('replaces a file with a new rev, a version of the old bytes and a feed row', async () => {
    const created = await write('one', 'a.txt');
    const replaced = await write('two!', 'a.txt', actor('ai'));
    expect(replaced.created).toBe(false);
    expect(replaced.item).toMatchObject({ rev: 2, bytes: 4 });
    expect(replaced.item.id).toBe(created.item.id);
    expect(replaced.version).toMatchObject({
      itemId: created.item.id,
      rev: 1,
      bytes: 3,
      via: 'ai',
    });
    expect(await text('a.txt')).toBe('two!');
    expect(opened.store.driveFeed.ofItem(created.item.id, 0, 10).rows.map((row) => row.op)).toEqual(
      ['create', 'update'],
    );
    expect(notices).toHaveLength(2);
  });

  it('puts a file in a subfolder only when the folder is indexed', async () => {
    await expect(write('x', 'docs/a.txt')).rejects.toMatchObject({ failure: 'missing' });
    expect(await text('docs/a.txt')).toBeNull();
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('refuses to replace a file the index does not know yet', async () => {
    await writeFile(join(dir, 'a.txt'), 'outside');
    await expect(write('x', 'a.txt')).rejects.toMatchObject({ failure: 'exists' });
    expect(await text('a.txt')).toBe('outside');
  });

  it('runs the alongside record in the same transaction', async () => {
    const staged = await stageBytes(env(), root, Readable.from([Buffer.from('x')]));
    await expect(
      commitContent(env(), {
        root,
        staged,
        relPath: 'a.txt',
        actor: actor(),
        alongside: () => {
          throw new Error('record failed');
        },
      }),
    ).rejects.toThrow('record failed');
    expect(opened.store.driveItems.byPath(root.id, 'a.txt')).toBeUndefined();
    expect(opened.store.driveFeed.latestSeq()).toBe(0);
  });
});

describe('own writes are not changes', () => {
  it('leaves one rev after the watcher event and a reconcile of a hub write', async () => {
    const created = await write('hello', 'a.txt');
    await reconcile('a.txt');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id)).toMatchObject({ rev: 1, outside: false });
    await write('hello again', 'a.txt');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id)).toMatchObject({ rev: 2, outside: false });
    expect(opened.store.driveFeed.sinceInRoot(root.id, 0, 10).rows).toHaveLength(2);
  });

  it('still sees a change made outside the hub', async () => {
    const created = await write('hello', 'a.txt');
    await writeFile(join(dir, 'a.txt'), 'changed outside');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id)).toMatchObject({ rev: 2, outside: true });
  });
});

describe('metadata changes', () => {
  it('records a star with its feed row and notice', async () => {
    const created = await write('hello', 'a.txt');
    const identity = opened.store.driveItems.identityOf(created.item.id);
    if (identity === null) throw new Error('identity');
    const starred = recordItem(env(), {
      draft: { ...created.item, starred: true },
      identity,
      op: 'star',
      actor: actor('automation'),
    });
    expect(starred.rev).toBe(2);
    expect(opened.store.driveFeed.latestSeq()).toBe(2);
    expect(notices).toHaveLength(2);
  });
});

describe('trash and restore', () => {
  it('trashes with a tombstone row, removes the item and re-arms the purge timer', async () => {
    const created = await write('hello', 'a.txt');
    purgeCalls = 0;
    await commitTrash(env(), root, created.item.id, actor());
    expect(await text('a.txt')).toBeNull();
    expect(opened.store.driveItems.find(created.item.id)).toBeUndefined();
    expect(opened.store.driveTrash.byId(created.item.id).purgeAt).toBe('2027-11-07T00:00:00.000Z');
    const last = opened.store.driveFeed.ofItem(created.item.id, 0, 10).rows.at(-1);
    expect(last).toMatchObject({ op: 'trash', rev: 2 });
    expect(opened.store.driveIntents.all()).toEqual([]);
    expect(purgeCalls).toBe(1);
  });

  it('restores under the same id with a restore row and never overwrites', async () => {
    const created = await write('hello', 'a.txt');
    await commitTrash(env(), root, created.item.id, actor());
    await write('newer', 'a.txt');
    const restored = await commitRestore(env(), root, created.item.id, actor());
    expect(restored.item.id).toBe(created.item.id);
    expect(restored.item.relPath).toBe('a (restored).txt');
    expect(await text('a.txt')).toBe('newer');
    expect(await text('a (restored).txt')).toBe('hello');
    expect(opened.store.driveTrash.find(created.item.id)).toBeUndefined();
    expect(opened.store.driveFeed.ofItem(created.item.id, 0, 10).rows.map((row) => row.op)).toEqual(
      ['create', 'trash', 'restore'],
    );
  });
});

describe('finishing a commit after a crash', () => {
  it('adds the version, the new rev and one outside feed row, then clears the intent', async () => {
    const created = await write('old bytes', 'a.txt');
    const e = env();
    const staged = await stageBytes(e, root, Readable.from([Buffer.from('new bytes!')]));
    await commitBytes(e, { root, staged, relPath: 'a.txt', previousSha256: null });
    expect(opened.store.driveIntents.all()).toHaveLength(1);
    const report = await recoverIntents({ ...e, finishCommit: finishCommitFromDisk(e) }, [root]);
    expect(report).toMatchObject({ completed: 1, rolledBack: 0, failed: 0 });
    expect(opened.store.driveIntents.all()).toEqual([]);
    const item = opened.store.driveItems.byId(created.item.id);
    expect(item).toMatchObject({ rev: 2, bytes: 10, outside: true, integrity: 'unknown' });
    expect(opened.store.driveVersions.findRev(created.item.id, 1)).toBeDefined();
    const last = opened.store.driveFeed.ofItem(created.item.id, 0, 10).rows.at(-1);
    expect(last).toMatchObject({ op: 'update', via: 'outside', actorProfileId: null });
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id).rev).toBe(2);
  });
});

describe('conflicts', () => {
  it('names the copy the Syncthing way', () => {
    const at = new Date('2026-11-07T13:05:09.000Z');
    expect(conflictName('report.final.txt', at, 'abcdef0123456789', 0)).toBe(
      'report.final.sync-conflict-20261107-130509-abcdef01.txt',
    );
    expect(conflictName('notes', at, 'abcdef0123456789', 1)).toBe(
      'notes.sync-conflict-20261107-130509-abcdef01-2',
    );
  });

  async function conflicted(): Promise<{ conflict: DriveConflict; hubId: string }> {
    const hub = await write('hub bytes', 'a.txt');
    const staged = await stageBytes(env(), root, Readable.from([Buffer.from('client bytes')]));
    const conflict = await commitConflictCopy(conflictEnv(), {
      hub: hub.item,
      staged,
      baseRev: 1,
      deviceId: randomUUID(),
      actor: actor('sync'),
    });
    return { conflict, hubId: hub.item.id };
  }

  it('keeps the hub version and lands the stale push as a normal file with a record', async () => {
    const { conflict, hubId } = await conflicted();
    expect(conflict.conflictRelPath).toMatch(
      /^a\.sync-conflict-20261107-000000-[0-9a-f]{8}\.txt$/u,
    );
    expect(await text('a.txt')).toBe('hub bytes');
    expect(await text(conflict.conflictRelPath)).toBe('client bytes');
    expect(opened.store.driveItems.byId(conflict.conflictItemId).relPath).toBe(
      conflict.conflictRelPath,
    );
    expect(conflict).toMatchObject({ itemId: hubId, hubRev: 1, baseRev: 1, resolution: null });
    expect(conflictRows.get(conflict.id)).toEqual(conflict);
  });

  it('keep_hub trashes the copy', async () => {
    const { conflict } = await conflicted();
    const resolved = await resolveConflict(
      conflictEnv(),
      { conflictId: conflict.id, resolution: 'keep_hub' },
      actor(),
    );
    expect(resolved.resolution).toBe('keep_hub');
    expect(await text('a.txt')).toBe('hub bytes');
    expect(await text(conflict.conflictRelPath)).toBeNull();
    expect(opened.store.driveTrash.find(conflict.conflictItemId)).toBeDefined();
  });

  it('keep_client puts the client bytes in place as a new rev with the hub bytes as a version', async () => {
    const { conflict, hubId } = await conflicted();
    await resolveConflict(
      conflictEnv(),
      { conflictId: conflict.id, resolution: 'keep_client' },
      actor(),
    );
    expect(await text('a.txt')).toBe('client bytes');
    expect(await text(conflict.conflictRelPath)).toBeNull();
    expect(opened.store.driveItems.byId(hubId).rev).toBe(2);
    expect(opened.store.driveVersions.findRev(hubId, 1)).toBeDefined();
  });

  it('keep_both leaves both files and only resolves the record', async () => {
    const { conflict } = await conflicted();
    await resolveConflict(
      conflictEnv(),
      { conflictId: conflict.id, resolution: 'keep_both' },
      actor(),
    );
    expect(await text('a.txt')).toBe('hub bytes');
    expect(await text(conflict.conflictRelPath)).toBe('client bytes');
  });

  it('refuses a conflict that is unknown or already resolved', async () => {
    const { conflict } = await conflicted();
    await resolveConflict(
      conflictEnv(),
      { conflictId: conflict.id, resolution: 'keep_both' },
      actor(),
    );
    await expect(
      resolveConflict(conflictEnv(), { conflictId: conflict.id, resolution: 'keep_hub' }, actor()),
    ).rejects.toMatchObject({ failure: 'resolved' });
    await expect(
      resolveConflict(conflictEnv(), { conflictId: randomUUID(), resolution: 'keep_hub' }, actor()),
    ).rejects.toMatchObject({ failure: 'unknown' });
  });
});

describe('the feed page', () => {
  it('carries the root index id and a cursor, and spots a stale index id', async () => {
    const first = await write('a', 'a.txt');
    await write('b', 'b.txt');
    const page = rootFeed(opened.store, root.id, 0, 10);
    expect(page.indexId).toBe(`index-${root.id}`);
    expect(page.rows).toHaveLength(2);
    expect(page.cursor).toBe(page.rows[1]?.seq);
    expect(rootFeed(opened.store, root.id, page.cursor, 10)).toMatchObject({
      rows: [],
      cursor: page.cursor,
    });
    expect(
      itemFeed(opened.store, { rootId: root.id, itemId: first.item.id }, 0, 10).rows,
    ).toHaveLength(1);
    expect(staleCursor(opened.store, root.id, 'old-index')).toBe(true);
    expect(staleCursor(opened.store, root.id, page.indexId)).toBe(false);
  });
});

describe('the purge timer', () => {
  function clocked(): { e: ChangeEnv; timer: PurgeTimer } {
    const e = env(() => new Date());
    const timer = new PurgeTimer(e);
    return { e: { ...e, purge: timer }, timer };
  }

  async function trashAt(e: ChangeEnv, name: string): Promise<string> {
    const staged = await stageBytes(e, root, Readable.from([Buffer.from(name)]));
    const made = await commitContent(e, { root, staged, relPath: name, actor: actor() });
    await commitTrash(e, root, made.item.id, actor());
    return made.item.id;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(START);
  });

  it('purges at 365 days and nothing earlier', async () => {
    const { e, timer } = clocked();
    timer.start();
    const id = await trashAt(e, 'a.txt');
    await vi.advanceTimersByTimeAsync(365 * DAY_MS - 1);
    await timer.settled();
    expect(opened.store.driveTrash.find(id)).toBeDefined();
    expect(await text(`.smarteverything/trash/${id}`)).toBe('a.txt');
    await vi.advanceTimersByTimeAsync(1);
    await timer.settled();
    expect(opened.store.driveTrash.find(id)).toBeUndefined();
    expect(await text(`.smarteverything/trash/${id}`)).toBeNull();
    expect(notices.at(-1)?.rootIds).toContain(root.id);
    timer.stop();
  });

  it('never asks the platform for a delay beyond its limit, which would fire at once', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const { e, timer } = clocked();
    timer.start();
    await trashAt(e, 'a.txt');
    const delays = spy.mock.calls.map((call) => Number(call[1]));
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMER_DELAY_MS);
    expect(MAX_TIMER_DELAY_MS).toBeLessThan(365 * DAY_MS);
    timer.stop();
  });

  it('re-arms after every change so an earlier deadline wins', async () => {
    const { e, timer } = clocked();
    timer.start();
    const later = await trashAt(e, 'later.txt');
    await vi.advanceTimersByTimeAsync(100 * DAY_MS);
    const earlier = await trashAt(e, 'earlier.txt');
    opened.store.driveTrash.remove(earlier);
    opened.store.driveTrash.insert({
      ...opened.store.driveTrash.byId(later),
      itemId: earlier,
      purgeAt: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    });
    timer.rearm();
    await vi.advanceTimersByTimeAsync(10 * DAY_MS);
    await timer.settled();
    expect(opened.store.driveTrash.find(earlier)).toBeUndefined();
    expect(opened.store.driveTrash.find(later)).toBeDefined();
    timer.stop();
  });

  it('arms nothing while there is nothing to purge and purges the versions on their own deadline', async () => {
    const { e, timer } = clocked();
    timer.start();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    expect(spy).not.toHaveBeenCalled();
    const made = await write('one', 'a.txt', actor(), e);
    const replaced = await write('two', 'a.txt', actor(), e);
    expect(replaced.version).not.toBeNull();
    expect(spy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(365 * DAY_MS);
    await timer.settled();
    expect(opened.store.driveVersions.findRev(made.item.id, 1)).toBeUndefined();
    expect(opened.store.driveItems.find(made.item.id)).toBeDefined();
    timer.stop();
  });

  it('purges a trashed item together with its versions', async () => {
    const { e } = clocked();
    const made = await write('one', 'a.txt', actor(), e);
    await write('two', 'a.txt', actor(), e);
    await commitTrash(e, root, made.item.id, actor());
    vi.setSystemTime(new Date(START.getTime() + 366 * DAY_MS));
    const tally = await purgeDue(e);
    expect(tally).toMatchObject({ trash: 1, failed: 0 });
    expect(opened.store.driveVersions.forItem(made.item.id, null, 10).versions).toEqual([]);
    await expect(stat(join(dir, '.smarteverything/versions'))).resolves.toBeDefined();
  });

  it('does not loop on an entry it cannot purge', async () => {
    const { timer } = clocked();
    const virtual = randomUUID();
    opened.store.driveRoots.insert(aiImagesRoot(rootRow(virtual, dir)));
    const id = randomUUID();
    opened.store.driveTrash.insert({
      itemId: id,
      rootId: virtual,
      name: 'x.png',
      originalRelPath: 'x.png',
      trashRelPath: `.smarteverything/trash/${id}`,
      isFolder: false,
      bytes: 1,
      deletedAt: START.toISOString(),
      purgeAt: new Date(START.getTime() + DAY_MS).toISOString(),
      deletedBy: null,
      addedByProfileId: null,
    });
    vi.setSystemTime(new Date(START.getTime() + 2 * DAY_MS));
    timer.start();
    await vi.advanceTimersByTimeAsync(1);
    await timer.settled();
    expect(opened.store.driveTrash.find(id)).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
