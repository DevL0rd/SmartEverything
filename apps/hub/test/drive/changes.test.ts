import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { DriveConflict } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitContent,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
} from '../../src/drive/changes';
import { finishCommitFromDisk } from '../../src/drive/commit-recovery';
import {
  commitConflictCopy,
  conflictName,
  resolveConflict,
  type ConflictEnv,
} from '../../src/drive/conflicts';
import { refusalReason } from '../../src/drive/service-write-support';
import { StoreConflictError } from '../../src/store/sql';
import { recoverIntents, type DriveWriteRoot } from '../../src/drive/intents';
import { hashRequested } from '../../src/drive/blocks';
import { TestScan, type TestScanDeps } from './local-ports';
import type { WalkEntry } from '../../src/drive/scanner-walk';
import { commitRestore, commitTrash } from '../../src/drive/trash-purge';
import { MAX_TIMER_DELAY_MS, PurgeTimer, purgeDue } from '../../src/drive/purge-timer';
import { commitBytes, nodeFiles, stageBytes } from '../../src/drive/versions';
import { isMissing } from '../../src/fs-util';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';
import type { WriteUnits } from '../../src/store/host/registry';
import type { UnitInput } from '../../src/store/host/unit';

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

function actor(via: ChangeActor['via'] = 'app'): ChangeActor {
  return via === 'sync' || via === 'mount'
    ? { actorProfileId: person, via, deviceId: randomUUID() }
    : { actorProfileId: person, via, deviceId: null };
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
    mtimeNs: bigint.mtimeNs.toString(),
    mode: Number(bigint.mode & 0o7777n),
    nlink: Number(bigint.nlink),
    dev: bigint.dev.toString(),
    ino: bigint.ino.toString(),
  };
}

function commitDependencies(): TestScanDeps {
  return {
    items: opened.store.driveItems,
    inodes: opened.store.driveInodes,
    missing: opened.store.driveMissing,
    hash: async (entry): Promise<string | null> => {
      const response = await hashRequested({
        id: 1,
        rootPath: opened.store.driveRoots.byId(root.id).path,
        relPath: entry.relPath,
        dev: entry.dev,
        ino: entry.ino,
        withBlocks: false,
      });
      return response.kind === 'hashed' ? response.sha256 : null;
    },
    write: <T>(work: () => T): T => opened.store.write(work),
    now: (): Date => START,
    newId: randomUUID,
  };
}

async function reconcile(relPath: string): Promise<void> {
  const committer = new TestScan(commitDependencies(), opened.store.driveRoots.byId(root.id), null);
  committer.apply([await walkEntry(relPath)]);
  await committer.finish([]);
}

async function scanTree(): Promise<void> {
  const committer = new TestScan(commitDependencies(), opened.store.driveRoots.byId(root.id), null);
  const folder = await walkEntry('d');
  const entries: WalkEntry[] = [];
  if ((await text('d/x.txt')) !== null) entries.push(await walkEntry('d/x.txt'));
  committer.apply([
    { ...folder, kind: 'folder', childCount: entries.length },
    ...entries.map((entry) => ({ ...entry, parentRelPath: 'd' })),
  ]);
  await committer.finish([]);
}

function indexedId(relPath: string): string {
  const found = opened.store.driveItems.byPath(root.id, relPath, null);
  if (found === undefined) throw new Error(`${relPath} is not indexed`);
  return found.id;
}

function racingEnv(
  watched: string,
  scan: () => Promise<void>,
): { readonly env: ChangeEnv; readonly fired: () => boolean } {
  let armed = true;
  return {
    fired: (): boolean => !armed,
    env: {
      ...env(),
      files: {
        ...nodeFiles,
        syncDirectory: async (directory: string): Promise<void> => {
          await nodeFiles.syncDirectory(directory);
          if (armed && (await text(watched)) !== null) {
            armed = false;
            await scan();
          }
        },
      },
    },
  };
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-changes-')));
  dir = opened.layout.home.drive;
  await mkdir(dir, { recursive: true });
  root = { id: randomUUID(), path: dir, versions: true };
  opened.store.driveRoots.insert(sharedDriveRoot(root.id));
  person = opened.store.profiles.first().id;
  notices = [];
  purgeCalls = 0;
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
        alongside: [{ kind: 'uploadComplete', uploadId: 'no-such-upload' }],
      }),
    ).rejects.toThrow();
    expect(opened.store.driveItems.byPath(root.id, 'a.txt', null)).toBeUndefined();
    expect(opened.store.driveFeed.latestSeq()).toBe(0);
  });
});

describe('own writes are not changes', () => {
  it('leaves one rev after the watcher event and a reconcile of a hub write', async () => {
    const created = await write('hello', 'a.txt');
    await reconcile('a.txt');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id, null)).toMatchObject({
      rev: 1,
      outside: false,
    });
    await write('hello again', 'a.txt');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id, null)).toMatchObject({
      rev: 2,
      outside: false,
    });
    expect(opened.store.driveFeed.sinceInRoot(root.id, 0, 10).rows).toHaveLength(2);
  });

  it('still sees a change made outside the hub', async () => {
    const created = await write('hello', 'a.txt');
    await writeFile(join(dir, 'a.txt'), 'changed outside');
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id, null)).toMatchObject({
      rev: 2,
      outside: true,
    });
  });
});

describe('metadata changes', () => {
  it('records a metadata change with its feed row and notice', async () => {
    const created = await write('hello', 'a.txt');
    const identity = opened.store.driveItems.identityOf(created.item.id);
    if (identity === null) throw new Error('identity');
    const touched = await recordItem(env(), {
      draft: { ...created.item, modifiedAt: '2026-11-08T00:00:00.000Z' },
      identity,
      op: 'update',
      actor: actor('automation'),
    });
    expect(touched.rev).toBe(2);
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
    expect(opened.store.driveItems.find(created.item.id, null)).toBeUndefined();
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

describe('restoring while a scan indexes the moved file', () => {
  it('takes over the path from the scan row and keeps the trashed id', async () => {
    const created = await write('hello', 'a.txt');
    await commitTrash(env(), root, created.item.id, actor());
    const race = racingEnv('a.txt', async () => reconcile('a.txt'));
    const restored = await commitRestore(race.env, root, created.item.id, actor());
    expect(race.fired()).toBe(true);
    expect(restored.item.id).toBe(created.item.id);
    expect(restored.item.relPath).toBe('a.txt');
    expect(opened.store.driveItems.byPath(root.id, 'a.txt', null)?.id).toBe(created.item.id);
    expect(opened.store.driveTrash.find(created.item.id)).toBeUndefined();
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('takes over every path under a restored folder from the scan rows', async () => {
    await mkdir(join(dir, 'd'));
    await writeFile(join(dir, 'd', 'x.txt'), 'inside');
    await scanTree();
    const folderId = indexedId('d');
    const childId = indexedId('d/x.txt');
    await commitTrash(env(), root, folderId, actor());
    expect(opened.store.driveItems.byPath(root.id, 'd/x.txt', null)).toBeUndefined();
    const race = racingEnv('d/x.txt', scanTree);
    const restored = await commitRestore(race.env, root, folderId, actor());
    expect(race.fired()).toBe(true);
    expect(restored.item.id).toBe(folderId);
    expect(indexedId('d')).toBe(folderId);
    expect(indexedId('d/x.txt')).toBe(childId);
    expect(opened.store.driveTrash.find(folderId)).toBeUndefined();
  });

  it('puts the file back into the trash when the index refuses the restore', async () => {
    const created = await write('hello', 'a.txt');
    await commitTrash(env(), root, created.item.id, actor());
    const { host } = opened.store;
    const hostWrite = host.write.bind(host);
    vi.spyOn(host, 'write').mockImplementation(
      <N extends keyof WriteUnits>(name: N, input: UnitInput<WriteUnits[N]>) =>
        name === 'driveOps' &&
        Array.isArray(input) &&
        input.some((op: unknown) => typeof op === 'object' && op !== null && 'reinstate' in op)
          ? Promise.reject(
              new StoreConflictError('create the drive item', new Error('constraint failed')),
            )
          : hostWrite(name, input),
    );
    await expect(commitRestore(env(), root, created.item.id, actor())).rejects.toBeInstanceOf(
      StoreConflictError,
    );
    expect(await text('a.txt')).toBeNull();
    expect(opened.store.driveTrash.find(created.item.id)).toBeDefined();
    expect(await text(`.smarteverything/trash/${created.item.id}`)).toBe('hello');
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('reports a store refusal as one failed item instead of failing the batch', () => {
    const cause = new StoreConflictError('create the drive item', new Error('constraint failed'));
    expect(refusalReason(cause)).toBe(cause.message);
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
    const item = opened.store.driveItems.byId(created.item.id, null);
    expect(item).toMatchObject({ rev: 2, bytes: 10, outside: true, integrity: 'unknown' });
    expect(opened.store.driveVersions.findRev(created.item.id, 1)).toBeDefined();
    const last = opened.store.driveFeed.ofItem(created.item.id, 0, 10).rows.at(-1);
    expect(last).toMatchObject({ op: 'update', via: 'outside', actorProfileId: null });
    await reconcile('a.txt');
    expect(opened.store.driveItems.byId(created.item.id, null).rev).toBe(2);
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
    expect(opened.store.driveItems.byId(conflict.conflictItemId, null).relPath).toBe(
      conflict.conflictRelPath,
    );
    expect(conflict).toMatchObject({ itemId: hubId, hubRev: 1, baseRev: 1, resolution: null });
    expect(opened.store.driveConflicts.find(conflict.id)).toEqual(conflict);
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
    expect(opened.store.driveItems.byId(hubId, null).rev).toBe(2);
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
    await timer.settled();
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
    await timer.settled();
    await vi.advanceTimersByTimeAsync(100 * DAY_MS);
    const earlier = await trashAt(e, 'earlier.txt');
    await timer.settled();
    opened.store.driveTrash.remove(earlier);
    opened.store.driveTrash.insert({
      ...opened.store.driveTrash.byId(later),
      itemId: earlier,
      purgeAt: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    });
    timer.rearm();
    await timer.settled();
    await vi.advanceTimersByTimeAsync(10 * DAY_MS);
    await timer.settled();
    expect(opened.store.driveTrash.find(earlier)).toBeUndefined();
    expect(opened.store.driveTrash.find(later)).toBeDefined();
    timer.stop();
  });

  it('arms nothing while there is nothing to purge and purges the versions on their own deadline', async () => {
    const { e, timer } = clocked();
    timer.start();
    await timer.settled();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    expect(spy).not.toHaveBeenCalled();
    const made = await write('one', 'a.txt', actor(), e);
    const replaced = await write('two', 'a.txt', actor(), e);
    expect(replaced.version).not.toBeNull();
    await timer.settled();
    expect(spy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(365 * DAY_MS);
    await timer.settled();
    expect(opened.store.driveVersions.findRev(made.item.id, 1)).toBeUndefined();
    expect(opened.store.driveItems.find(made.item.id, null)).toBeDefined();
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
});
