import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeActor, ChangeEnv } from '../../src/drive/changes';
import { commitContent, finishCommitFromDisk } from '../../src/drive/changes';
import { exchangeWithin, settleExchange } from '../../src/drive/exchange';
import {
  mountStagingRelPath,
  orphanRelPath,
  recoverIntents,
  TMP_DIRECTORY,
  TRASH_DIRECTORY,
  versionRelPath,
  type DriveFiles,
  type DriveWriteRoot,
  type RecoveryEnv,
} from '../../src/drive/intents';
import { dropOrphan, holdOrphan, sweepOrphansAtStart } from '../../src/drive/orphans';
import { commitPatchContent } from '../../src/drive/patch-content';
import { commitPatch } from '../../src/drive/patch-commit';
import { ORPHAN_DIRECTORY } from '../../src/drive/paths';
import { moveToTrash, restoreFromTrash, type RestoreEnv } from '../../src/drive/trash';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import { isMissing } from '../../src/fs-util';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const ACTOR: ChangeActor = { actorProfileId: null, via: 'app', deviceId: null };

let opened: TestStore;

class Crash extends Error {
  override readonly name = 'Crash';
}

interface Scenario {
  readonly dir: string;
  readonly root: DriveWriteRoot;
}

async function scenario(versions = false): Promise<Scenario> {
  const owner = opened.store.profiles.create({ name: `Person ${randomUUID().slice(0, 4)}` });
  const id = randomUUID();
  const dir = opened.layout.person(owner.id).drive;
  await mkdir(dir, { recursive: true });
  opened.store.driveRoots.insert(personalDriveRoot(id, owner.id, { versions }));
  return { dir, root: { id, path: dir, versions } };
}

function crashing(crashAt: number): { files: DriveFiles; mutations: () => number } {
  let count = 0;
  const guard =
    <A extends unknown[], R>(work: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      count += 1;
      if (count >= crashAt) throw new Crash('the process died');
      return work(...args);
    };
  return {
    mutations: () => count,
    files: {
      ...nodeFiles,
      mkdir: guard(nodeFiles.mkdir),
      rename: guard(nodeFiles.rename),
      link: guard(nodeFiles.link),
      unlink: guard(nodeFiles.unlink),
      remove: guard(nodeFiles.remove),
      stage: guard(nodeFiles.stage),
      writeDurable: guard(nodeFiles.writeDurable),
      syncDirectory: guard(nodeFiles.syncDirectory),
      chmod: guard(nodeFiles.chmod),
      clone: guard(nodeFiles.clone),
      writeUndo: guard(nodeFiles.writeUndo),
      applyPatch: guard(nodeFiles.applyPatch),
      restoreUndo: guard(nodeFiles.restoreUndo),
    },
  };
}

function env(files: DriveFiles = nodeFiles): ReturnType<typeof fileEnv> {
  return fileEnv(opened.store, testLogger('drive'), () => NOW, files);
}

function changes(files: DriveFiles = nodeFiles): ChangeEnv {
  return { ...env(files), store: opened.store, purge: { rearm: (): void => undefined } };
}

function restoreEnv(files: DriveFiles = nodeFiles): RestoreEnv {
  return { ...env(files), store: opened.store };
}

function recovery(
  finish: RecoveryEnv['finishCommit'] = finishCommitFromDisk(changes()),
): RecoveryEnv {
  return { ...env(), finishCommit: finish };
}

function source(value: string): AsyncIterable<Uint8Array> {
  return Readable.from([Buffer.from(value)]);
}

async function text(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function names(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

async function put(made: Scenario, rel: string, value: string): Promise<void> {
  await mkdir(dirname(join(made.dir, rel)), { recursive: true });
  await writeFile(join(made.dir, rel), value);
}

async function index(made: Scenario, rel: string, shareWith?: string): Promise<string> {
  const stats = await lstat(join(made.dir, rel), { bigint: true });
  const id = randomUUID();
  const sibling =
    shareWith === undefined
      ? undefined
      : opened.store.driveInodes.ofItem(
          opened.store.driveItems.byPath(made.root.id, shareWith, null)?.id ?? '',
        );
  opened.store.driveItems.write({
    item: {
      id,
      rootId: made.root.id,
      parentId: null,
      relPath: rel,
      name: rel,
      modifiedAt: new Date(Number(stats.mtimeNs / 1_000_000n)).toISOString(),
      addedAt: NOW.toISOString(),
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'document',
      mime: 'text/plain',
      bytes: Number(stats.size),
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
    },
    identity: { dev: stats.dev.toString(), ino: stats.ino.toString() },
    ...(sibling === undefined ? {} : { shareInode: sibling.id }),
  });
  return id;
}

async function stagedAt(
  made: Scenario,
  parts: readonly (readonly [number, string])[],
): Promise<{ relPath: string }> {
  const staged = await stageBytes(env(), made.root, source(''));
  const path = join(made.dir, staged.relPath);
  const handle = await open(path, 'r+');
  try {
    for (const [offset, value] of parts) {
      await handle.write(Buffer.from(value), 0, Buffer.byteLength(value), offset);
    }
  } finally {
    await handle.close();
  }
  return { relPath: staged.relPath };
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
});

afterEach(async () => {
  await opened.close();
});

describe('a patch commit', () => {
  it('writes the ranges into the live file in place and keeps its inode and mode', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'hello world');
    await chmod(join(made.dir, 'a.txt'), 0o755);
    const before = await stat(join(made.dir, 'a.txt'), { bigint: true });
    const staged = await stagedAt(made, [[6, 'WORLD']]);
    const done = await commitPatch(env(), {
      root: made.root,
      staged,
      relPath: 'a.txt',
      previousSha256: null,
      patch: { ranges: [[6, 11]], size: 11 },
    });
    const after = await stat(join(made.dir, 'a.txt'), { bigint: true });
    expect(await text(join(made.dir, 'a.txt'))).toBe('hello WORLD');
    expect(after.ino).toBe(before.ino);
    expect(Number(after.mode & 0o7777n)).toBe(0o755);
    expect(done.bytes).toBe(11);
    expect(done.sha256).toBeNull();
    expect(await text(join(made.dir, staged.relPath))).toBeNull();
    expect(opened.store.driveIntents.all().map((intent) => intent.op)).toEqual(['patch']);
  });

  it('extends the file with zeros past the old end and shrinks it to the new size', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'abcdef');
    await commitPatch(env(), {
      root: made.root,
      staged: await stagedAt(made, [[8, 'XY']]),
      relPath: 'a.txt',
      previousSha256: null,
      patch: { ranges: [[8, 10]], size: 10 },
    });
    expect(await readFile(join(made.dir, 'a.txt'))).toEqual(Buffer.from('abcdef\0\0XY'));
    await commitPatch(env(), {
      root: made.root,
      staged: await stagedAt(made, []),
      relPath: 'a.txt',
      previousSha256: null,
      patch: { ranges: [], size: 3 },
    });
    expect(await text(join(made.dir, 'a.txt'))).toBe('abc');
  });

  it('refuses to patch a missing file, a folder and a link', async () => {
    const made = await scenario();
    await mkdir(join(made.dir, 'dir'));
    await symlink('target', join(made.dir, 'link'));
    for (const relPath of ['missing', 'dir', 'link']) {
      await expect(
        commitPatch(env(), {
          root: made.root,
          staged: await stagedAt(made, []),
          relPath,
          previousSha256: null,
          patch: { ranges: [], size: 0 },
        }),
      ).rejects.toMatchObject({ failure: 'missing' });
    }
  });

  it('keeps the old content as a version before it patches when history is on', async () => {
    const made = await scenario(true);
    await put(made, 'a.txt', 'hello world');
    await index(made, 'a.txt');
    const result = await commitPatchContent(changes(), {
      root: made.root,
      staged: await stagedAt(made, [[0, 'J']]),
      relPath: 'a.txt',
      patch: { ranges: [[0, 1]], size: 11 },
      actor: ACTOR,
    });
    const sha = createHash('sha256').update('hello world').digest('hex');
    expect(await text(join(made.dir, 'a.txt'))).toBe('Jello world');
    expect(await text(join(made.dir, versionRelPath(sha)))).toBe('hello world');
    expect(result.version).toMatchObject({ sha256: sha, bytes: 11 });
    expect(result.item).toMatchObject({ bytes: 11, sha256: null, integrity: 'unknown' });
    expect(opened.store.driveIntents.all()).toEqual([]);
    expect(await names(join(made.dir, TMP_DIRECTORY))).toEqual([]);
  });

  it('keeps no version when history is off', async () => {
    const made = await scenario(false);
    await put(made, 'a.txt', 'hello world');
    await index(made, 'a.txt');
    const result = await commitPatchContent(changes(), {
      root: made.root,
      staged: await stagedAt(made, [[0, 'J']]),
      relPath: 'a.txt',
      patch: { ranges: [[0, 1]], size: 11 },
      actor: ACTOR,
    });
    expect(result.version).toBeNull();
    expect(await names(join(made.dir, '.smarteverything/versions'))).toEqual([]);
  });

  it('refuses a file that is not in the index', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'x');
    await expect(
      commitPatchContent(changes(), {
        root: made.root,
        staged: await stagedAt(made, []),
        relPath: 'a.txt',
        patch: { ranges: [], size: 1 },
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ failure: 'exists' });
  });

  it('is rolled back or completed whole after a crash at every step', async () => {
    const operate = async (made: Scenario, files: DriveFiles): Promise<void> => {
      await commitPatch(env(files), {
        root: made.root,
        staged: await stagedAt(made, [[6, 'WORLD']]),
        relPath: 'a.txt',
        previousSha256: null,
        patch: { ranges: [[6, 11]], size: 11 },
      });
    };
    const counter = crashing(Number.POSITIVE_INFINITY);
    const first = await scenario(true);
    await put(first, 'a.txt', 'hello world');
    await operate(first, counter.files);
    const total = counter.mutations();
    expect(total).toBe(4);
    for (const open of opened.store.driveIntents.all()) opened.store.driveIntents.clear(open.id);
    for (let point = 1; point <= total; point += 1) {
      const made = await scenario(true);
      await put(made, 'a.txt', 'hello world');
      await index(made, 'a.txt');
      const before = await stat(join(made.dir, 'a.txt'), { bigint: true });
      await expect(operate(made, crashing(point).files)).rejects.toThrow(Crash);
      await recoverIntents(recovery(), [made.root]);
      expect(await text(join(made.dir, 'a.txt'))).toBe('hello world');
      expect((await stat(join(made.dir, 'a.txt'), { bigint: true })).ino).toBe(before.ino);
      expect(opened.store.driveIntents.forRoot(made.root.id)).toEqual([]);
      expect(await names(join(made.dir, TMP_DIRECTORY))).toEqual([]);
    }
  });

  it('restores the bytes a half-applied patch overwrote, including a truncated tail', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'abcdefghij');
    const staged = await stagedAt(made, [[2, 'XX']]);
    const live = join(made.dir, 'a.txt');
    const undo = join(made.dir, `${staged.relPath}.undo`);
    const patch = { ranges: [[2, 4]], size: 6 } as const;
    await nodeFiles.writeUndo(live, undo, join(made.dir, 'undo-temporary'), patch);
    await nodeFiles.applyPatch(live, join(made.dir, staged.relPath), patch);
    expect(await text(live)).toBe('abXXef');
    await nodeFiles.restoreUndo(live, undo);
    expect(await text(live)).toBe('abcdefghij');
  });

  it('completes a patch whose bytes landed but whose database update did not happen', async () => {
    const made = await scenario(true);
    await put(made, 'a.txt', 'old content');
    await link(join(made.dir, 'a.txt'), join(made.dir, 'b.txt'));
    const aId = await index(made, 'a.txt');
    const bId = await index(made, 'b.txt', 'a.txt');
    await commitPatch(env(), {
      root: made.root,
      staged: await stagedAt(made, [[11, 'xyz']]),
      relPath: 'a.txt',
      previousSha256: null,
      patch: { ranges: [[11, 14]], size: 14 },
    });
    const report = await recoverIntents(recovery(), [made.root]);
    expect(report).toMatchObject({ completed: 1, failed: 0 });
    expect(opened.store.driveIntents.forRoot(made.root.id)).toEqual([]);
    for (const id of [aId, bId]) {
      expect(opened.store.driveItems.byId(id, null)).toMatchObject({
        bytes: 14,
        sha256: null,
        integrity: 'unknown',
      });
    }
    expect(opened.store.driveVersions.forItem(aId, null, 10).versions).toHaveLength(1);
  });
});

describe('a content commit to a file with several names', () => {
  it('patches in place so the disk hard link stays one inode and updates every name', async () => {
    const made = await scenario(true);
    await put(made, 'a.txt', 'old content');
    await link(join(made.dir, 'a.txt'), join(made.dir, 'b.txt'));
    const aId = await index(made, 'a.txt');
    const bId = await index(made, 'b.txt', 'a.txt');
    const inodeBefore = opened.store.driveInodes.ofItem(aId)?.id;
    const staged = await stageBytes(env(), made.root, source('brand new'));
    const result = await commitContent(changes(), {
      root: made.root,
      staged,
      relPath: 'a.txt',
      actor: ACTOR,
    });
    const [a, b] = [
      await stat(join(made.dir, 'a.txt'), { bigint: true }),
      await stat(join(made.dir, 'b.txt'), { bigint: true }),
    ];
    expect(a.ino).toBe(b.ino);
    expect(a.nlink).toBe(2n);
    expect(await text(join(made.dir, 'b.txt'))).toBe('brand new');
    expect(result.item).toMatchObject({ bytes: 9, sha256: staged.sha256 });
    expect(opened.store.driveItems.byId(bId, null)).toMatchObject({
      bytes: 9,
      sha256: staged.sha256,
    });
    expect(opened.store.driveInodes.ofItem(aId)?.id).toBe(inodeBefore);
    expect(opened.store.driveInodes.ofItem(bId)?.id).toBe(inodeBefore);
    expect(result.version).not.toBeNull();
  });

  it('replaces a file with one name by rename and keeps its mode', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'old');
    await chmod(join(made.dir, 'a.txt'), 0o755);
    await index(made, 'a.txt');
    const before = await stat(join(made.dir, 'a.txt'), { bigint: true });
    await commitContent(changes(), {
      root: made.root,
      staged: await stageBytes(env(), made.root, source('new')),
      relPath: 'a.txt',
      actor: ACTOR,
    });
    const after = await stat(join(made.dir, 'a.txt'), { bigint: true });
    expect(after.ino).not.toBe(before.ino);
    expect(Number(after.mode & 0o7777n)).toBe(0o755);
  });

  it('creates a new file with the default mode and the requested mode', async () => {
    const made = await scenario();
    await commitContent(changes(), {
      root: made.root,
      staged: await stageBytes(env(), made.root, source('x')),
      relPath: 'plain.txt',
      actor: ACTOR,
    });
    await commitContent(changes(), {
      root: made.root,
      staged: await stageBytes(env(), made.root, source('x')),
      relPath: 'private.txt',
      actor: ACTOR,
      mode: 0o400,
    });
    expect((await stat(join(made.dir, 'plain.txt'))).mode & 0o7777).toBe(0o644);
    expect((await stat(join(made.dir, 'private.txt'))).mode & 0o7777).toBe(0o600);
    const stored = opened.store.driveItems.byPath(made.root.id, 'private.txt', null);
    expect(opened.store.driveInodes.ofItem(stored?.id ?? '')?.mode).toBe(0o400);
  });
});

describe('exchanging two paths', () => {
  async function pair(made: Scenario): Promise<void> {
    await put(made, 'one/a.txt', 'AAA');
    await put(made, 'two/b.txt', 'BBB');
  }

  async function state(made: Scenario): Promise<[string | null, string | null]> {
    return [await text(join(made.dir, 'one/a.txt')), await text(join(made.dir, 'two/b.txt'))];
  }

  it('swaps the two files and leaves the intent open for the caller to settle', async () => {
    const made = await scenario();
    await pair(made);
    const intent = await exchangeWithin(env(), made.root, { a: 'one/a.txt', b: 'two/b.txt' });
    expect(await state(made)).toEqual(['BBB', 'AAA']);
    expect(opened.store.driveIntents.all().map((open) => open.op)).toEqual(['exchange']);
    opened.store.driveIntents.clear(intent.id);
    await settleExchange(env(), made.root, intent);
    expect(await names(join(made.dir, TMP_DIRECTORY))).toEqual([]);
  });

  it('swaps a file with a folder', async () => {
    const made = await scenario();
    await put(made, 'file', 'F');
    await put(made, 'folder/inner', 'I');
    await exchangeWithin(env(), made.root, { a: 'file', b: 'folder' });
    expect((await lstat(join(made.dir, 'file'))).isDirectory()).toBe(true);
    expect(await text(join(made.dir, 'file/inner'))).toBe('I');
    expect(await text(join(made.dir, 'folder'))).toBe('F');
  });

  it('refuses when one side is missing', async () => {
    const made = await scenario();
    await put(made, 'a', 'A');
    await expect(exchangeWithin(env(), made.root, { a: 'a', b: 'nope' })).rejects.toMatchObject({
      failure: 'missing',
    });
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('goes back to the original state after a crash at every step', async () => {
    const operate = (made: Scenario, files: DriveFiles): Promise<unknown> =>
      exchangeWithin(env(files), made.root, { a: 'one/a.txt', b: 'two/b.txt' });
    const counter = crashing(Number.POSITIVE_INFINITY);
    const first = await scenario();
    await pair(first);
    await operate(first, counter.files);
    const total = counter.mutations();
    expect(total).toBeGreaterThanOrEqual(5);
    for (const open of opened.store.driveIntents.all()) opened.store.driveIntents.clear(open.id);
    for (let point = 1; point <= total; point += 1) {
      const made = await scenario();
      await pair(made);
      await expect(operate(made, crashing(point).files)).rejects.toThrow(Crash);
      await recoverIntents(recovery(), [made.root]);
      expect(await state(made)).toEqual(['AAA', 'BBB']);
      expect(opened.store.driveIntents.forRoot(made.root.id)).toEqual([]);
      expect(await names(join(made.dir, TMP_DIRECTORY))).toEqual([]);
    }
    const whole = await scenario();
    await pair(whole);
    await operate(whole, nodeFiles);
    await recoverIntents(recovery(), [whole.root]);
    expect(await state(whole)).toEqual(['AAA', 'BBB']);
  });
});

describe('the orphan folder', () => {
  it('holds a file under its inode number and drops it', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'kept while open');
    await holdOrphan(nodeFiles, made.root, 'a.txt', 41);
    expect(await text(join(made.dir, 'a.txt'))).toBeNull();
    expect(await text(join(made.dir, orphanRelPath(41)))).toBe('kept while open');
    await dropOrphan(nodeFiles, made.root, 41);
    expect(await names(join(made.dir, ORPHAN_DIRECTORY))).toEqual([]);
  });

  it('is emptied at start together with the inodes the database holds as orphans', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'x');
    const inode = opened.store.driveInodes.create({ rootId: made.root.id, type: 'file' });
    opened.store.driveInodes.setOrphan(inode.id, true);
    await holdOrphan(nodeFiles, made.root, 'a.txt', inode.id);
    expect(await sweepOrphansAtStart(env(), made.root)).toBe(1);
    expect(await names(join(made.dir, ORPHAN_DIRECTORY))).toEqual([]);
    expect(opened.store.driveInodes.find(inode.id)).toBeUndefined();
  });
});

describe('the sweep of the temporary folder at start', () => {
  it('keeps the staging file of an open mount commit and removes everything else', async () => {
    const made = await scenario();
    const inode = opened.store.driveInodes.create({ rootId: made.root.id, type: 'file' });
    const { database } = opened.store;
    database.exec('pragma foreign_keys = off');
    const placementId = randomUUID();
    const nodeId = randomUUID();
    database
      .prepare(
        `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path,
          enabled, created_by, created_at, excluded, ignore_patterns, conflict_copies, state,
          read_only, cache_bytes, pinned_bytes, open_files, pending_uploads, need_bytes, errors,
          reported_at)
          values (?, ?, ?, null, 'synced', '/sync', 1, ?, ?, '[]', '[]', 1, 'up_to_date', 0, 0, 0,
            0, 0, 0, '[]', ?)`,
      )
      .run(placementId, nodeId, made.root.id, randomUUID(), NOW.toISOString(), NOW.toISOString());
    const commit = database
      .prepare(
        `insert into drive_mount_commits (placement_id, node_id, inode_id, op_key, base_rev, size,
          ranges, state, result_rev, created_at)
          values (?, ?, ?, ?, 1, null, '[]', 'open', null, ?) returning id`,
      )
      .get(placementId, nodeId, inode.id, new Uint8Array(16), NOW.toISOString());
    const id = Number(commit?.['id']);
    await put(made, mountStagingRelPath(id), 'half of a commit');
    await put(made, `${TMP_DIRECTORY}/junk`, 'left over');
    await recoverIntents(recovery(), [made.root]);
    expect(await names(join(made.dir, TMP_DIRECTORY))).toEqual([`commit-${String(id)}`]);
    database.exec('pragma foreign_keys = on');
  });
});

describe('trashing one name of a file with several names', () => {
  it('keeps the other name and a private copy of the content in the trash', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'shared bytes');
    await link(join(made.dir, 'a.txt'), join(made.dir, 'b.txt'));
    const move = await moveToTrash(env(), made.root, {
      itemId: randomUUID(),
      relPath: 'a.txt',
      name: 'a.txt',
      isFolder: false,
      onDisk: true,
      bytes: 12,
      deletedBy: null,
      addedByProfileId: null,
    });
    const [kept, trashed] = [
      await stat(join(made.dir, 'b.txt'), { bigint: true }),
      await stat(join(made.dir, move.entry.trashRelPath), { bigint: true }),
    ];
    expect(await text(join(made.dir, 'a.txt'))).toBeNull();
    expect(kept.nlink).toBe(1n);
    expect(trashed.ino).not.toBe(kept.ino);
    expect(await text(join(made.dir, move.entry.trashRelPath))).toBe('shared bytes');
    await writeFile(join(made.dir, 'b.txt'), 'changed afterwards');
    expect(await text(join(made.dir, move.entry.trashRelPath))).toBe('shared bytes');
    opened.store.write(() => {
      opened.store.driveTrash.insert(move.entry);
      if (move.intent !== null) opened.store.driveIntents.clear(move.intent.id);
    });
    const restored = await restoreFromTrash(restoreEnv(), made.root, { entry: move.entry, onDisk: true });
    expect(await text(join(made.dir, restored.relPath))).toBe('shared bytes');
  });

  it('is undone after a crash at every step', async () => {
    const itemId = randomUUID();
    const operate = (made: Scenario, files: DriveFiles): Promise<unknown> =>
      moveToTrash(env(files), made.root, {
        itemId,
        relPath: 'a.txt',
        name: 'a.txt',
        isFolder: false,
        onDisk: true,
        bytes: 12,
        deletedBy: null,
        addedByProfileId: null,
      });
    const build = async (): Promise<Scenario> => {
      const made = await scenario();
      await put(made, 'a.txt', 'shared bytes');
      await link(join(made.dir, 'a.txt'), join(made.dir, 'b.txt'));
      return made;
    };
    const counter = crashing(Number.POSITIVE_INFINITY);
    await operate(await build(), counter.files);
    const total = counter.mutations();
    for (const open of opened.store.driveIntents.all()) opened.store.driveIntents.clear(open.id);
    for (let point = 1; point <= total; point += 1) {
      const made = await build();
      await expect(operate(made, crashing(point).files)).rejects.toThrow(Crash);
      await recoverIntents(recovery(), [made.root]);
      expect(await text(join(made.dir, 'a.txt'))).toBe('shared bytes');
      expect(await text(join(made.dir, 'b.txt'))).toBe('shared bytes');
      expect(await names(join(made.dir, TRASH_DIRECTORY))).toEqual([]);
      expect(opened.store.driveIntents.forRoot(made.root.id)).toEqual([]);
    }
  });
});

describe('cloning a file', () => {
  it('copies the content under a new inode and refuses a link as the source', async () => {
    const made = await scenario();
    await put(made, 'a.txt', 'clone me');
    const target = join(made.dir, 'copies/b.txt');
    await nodeFiles.clone(join(made.dir, 'a.txt'), target, join(made.dir, 'tmp-clone'));
    expect(await text(target)).toBe('clone me');
    expect((await stat(target)).ino).not.toBe((await stat(join(made.dir, 'a.txt'))).ino);
    await symlink('a.txt', join(made.dir, 'link'));
    await expect(
      nodeFiles.clone(
        join(made.dir, 'link'),
        join(made.dir, 'c.txt'),
        join(made.dir, 'tmp-clone-2'),
      ),
    ).rejects.toMatchObject({ code: 'ELOOP' });
    expect(await realpath(made.dir)).toBe(made.dir);
  });

  it('refuses to read, patch or change the mode through a link', async () => {
    const made = await scenario();
    await put(made, 'real.txt', 'real bytes');
    await symlink(join(made.dir, 'real.txt'), join(made.dir, 'link'));
    await expect(
      (async (): Promise<void> => {
        for await (const chunk of nodeFiles.read(join(made.dir, 'link'))) void chunk;
      })(),
    ).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(nodeFiles.chmod(join(made.dir, 'link'), 0o777)).rejects.toMatchObject({
      code: 'ELOOP',
    });
    expect((await stat(join(made.dir, 'real.txt'))).mode & 0o7777).toBe(0o644);
    expect(await text(join(made.dir, 'real.txt'))).toBe('real bytes');
  });
});
