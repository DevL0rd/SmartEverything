import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DRIVE_TRASH_ENTRY, type DriveRoot, type DriveTrashEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DriveWriteError,
  recoverIntents,
  TMP_DIRECTORY,
  TRASH_DIRECTORY,
  versionRelPath,
  type DriveFiles,
  type DriveWriteRoot,
  type RecoveryEnv,
} from '../../src/drive/intents';
import { moveToTrash, removeTrashEntry, restoreFromTrash } from '../../src/drive/trash';
import {
  captureVersion,
  commitBytes,
  fileEnv,
  newVersion,
  nodeFiles,
  purgeVersions,
  stageBytes,
  stageVersion,
  type CommittedBytes,
  sweepOrphanVersionsAtStart,
} from '../../src/drive/versions';
import { isMissing } from '../../src/fs-util';
import type { DriveVersionEntry } from '../../src/store/repositories/drive-versions';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const OLD = 'old bytes';
const NEW = 'new bytes';

let opened: TestStore;
let base = '';
let finished: string[] = [];

class Crash extends Error {
  override readonly name = 'Crash';
}

interface Scenario {
  readonly dir: string;
  readonly root: DriveWriteRoot;
}

function rootRow(id: string, path: string, readOnly: boolean, versions: boolean): DriveRoot {
  return {
    id,
    kind: 'folder',
    label: `Root ${id.slice(0, 4)}`,
    scope: 'home',
    ownerProfileId: null,
    path,
    readOnly,
    versions,
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

async function scenario(readOnly = false, versions = true): Promise<Scenario> {
  const dir = await realpath(await mkdtemp(join(base, 'root-')));
  const id = randomUUID();
  opened.store.driveRoots.insert(rootRow(id, dir, readOnly, versions && !readOnly));
  return { dir, root: { id, path: dir, readOnly, versions: versions && !readOnly } };
}

async function put(dir: string, rel: string, text: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), text);
}

async function text(dir: string, rel: string): Promise<string | null> {
  try {
    return await readFile(join(dir, rel), 'utf8');
  } catch (cause) {
    if (isMissing(cause)) {
      return null;
    }
    throw cause;
  }
}

async function names(dir: string, rel: string): Promise<string[]> {
  try {
    return await readdir(join(dir, rel));
  } catch (cause) {
    if (isMissing(cause)) {
      return [];
    }
    throw cause;
  }
}

const OLD_SHA = createHash('sha256').update(OLD).digest('hex');

function crashing(crashAt: number): { files: DriveFiles; mutations: () => number } {
  let count = 0;
  const guard =
    <A extends unknown[], R>(work: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      count += 1;
      if (count >= crashAt) {
        throw new Crash('the process died');
      }
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
    },
  };
}

function env(files: DriveFiles = nodeFiles): ReturnType<typeof fileEnv> {
  return fileEnv(opened.store, testLogger('drive'), () => NOW, files);
}

function recovery(): RecoveryEnv {
  return {
    ...env(),
    finishCommit: (intent): void => {
      finished.push(intent.toPath);
      opened.store.driveIntents.clear(intent.id);
    },
  };
}

function source(value: string): AsyncIterable<Uint8Array> {
  return Readable.from([Buffer.from(value)]);
}

async function eachCrashPoint<T extends Scenario>(
  build: () => Promise<T>,
  operate: (made: T, files: DriveFiles) => Promise<unknown>,
  verify: (made: T) => Promise<void>,
): Promise<number> {
  const counter = crashing(Number.POSITIVE_INFINITY);
  await operate(await build(), counter.files);
  const total = counter.mutations();
  for (const open of opened.store.driveIntents.all()) {
    opened.store.driveIntents.clear(open.id);
  }
  for (let point = 1; point <= total; point += 1) {
    finished = [];
    const made = await build();
    await expect(operate(made, crashing(point).files)).rejects.toThrow(Crash);
    await recoverIntents(recovery(), [made.root]);
    await verify(made);
  }
  finished = [];
  const whole = await build();
  await operate(whole, nodeFiles);
  await recoverIntents(recovery(), [whole.root]);
  await verify(whole);
  return total;
}

async function trashed(
  made: Scenario,
  relPath: string,
  isFolder = false,
): Promise<DriveTrashEntry> {
  const move = await moveToTrash(env(), made.root, {
    itemId: randomUUID(),
    relPath,
    name: relPath.split('/').at(-1) ?? relPath,
    isFolder,
    bytes: 1,
    deletedBy: null,
    addedByProfileId: null,
  });
  opened.store.write(() => {
    opened.store.driveTrash.insert(move.entry);
    opened.store.driveIntents.clear(move.intent.id);
  });
  return move.entry;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-intents-')));
  finished = [];
});

afterEach(async () => {
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('trash', () => {
  it('moves a file into the root trash with a manifest and an open intent', async () => {
    const made = await scenario();
    await put(made.dir, 'docs/a.txt', OLD);
    const move = await moveToTrash(env(), made.root, {
      itemId: randomUUID(),
      relPath: 'docs/a.txt',
      name: 'a.txt',
      isFolder: false,
      bytes: 9,
      deletedBy: null,
      addedByProfileId: null,
    });
    expect(await text(made.dir, 'docs/a.txt')).toBeNull();
    expect(await text(made.dir, move.entry.trashRelPath)).toBe(OLD);
    const manifest = DRIVE_TRASH_ENTRY.parse(
      JSON.parse((await text(made.dir, `${move.entry.trashRelPath}.json`)) ?? ''),
    );
    expect(manifest).toEqual(move.entry);
    expect(move.entry.purgeAt).toBe('2027-11-07T00:00:00.000Z');
    expect(opened.store.driveIntents.all().map((intent) => intent.op)).toEqual(['trash']);
  });

  it('is undone or kept consistently after a crash at every step', async () => {
    const total = await eachCrashPoint(
      async () => {
        const made = await scenario();
        await put(made.dir, 'dir/inner/a.txt', OLD);
        return made;
      },
      (made, files) =>
        moveToTrash(env(files), made.root, {
          itemId: randomUUID(),
          relPath: 'dir',
          name: 'dir',
          isFolder: true,
          bytes: 9,
          deletedBy: null,
          addedByProfileId: null,
        }),
      async (made) => {
        expect(await text(made.dir, 'dir/inner/a.txt')).toBe(OLD);
        expect(await names(made.dir, TRASH_DIRECTORY)).toEqual([]);
        expect(opened.store.driveIntents.all()).toEqual([]);
      },
    );
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it('refuses a read-only root and leaves no intent', async () => {
    const made = await scenario(true);
    await put(made.dir, 'a.txt', OLD);
    await expect(
      moveToTrash(env(), made.root, {
        itemId: randomUUID(),
        relPath: 'a.txt',
        name: 'a.txt',
        isFolder: false,
        bytes: 9,
        deletedBy: null,
        addedByProfileId: null,
      }),
    ).rejects.toMatchObject({ failure: 'read-only' });
    expect(await text(made.dir, 'a.txt')).toBe(OLD);
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('does not follow a symlink leaf out of the root', async () => {
    const made = await scenario();
    const outside = join(base, 'outside.txt');
    await writeFile(outside, OLD);
    await symlink(outside, join(made.dir, 'link.txt'));
    const entry = await trashed(made, 'link.txt');
    expect(await text(made.dir, 'link.txt')).toBeNull();
    expect(await readFile(outside, 'utf8')).toBe(OLD);
    expect((await lstat(join(made.dir, entry.trashRelPath))).isSymbolicLink()).toBe(true);
  });
});

describe('restore', () => {
  it('returns the item to its original path', async () => {
    const made = await scenario();
    await put(made.dir, 'docs/a.txt', OLD);
    const entry = await trashed(made, 'docs/a.txt');
    const restored = await restoreFromTrash(env(), made.root, entry);
    expect(restored.relPath).toBe('docs/a.txt');
    expect(await text(made.dir, 'docs/a.txt')).toBe(OLD);
    expect(await names(made.dir, TRASH_DIRECTORY)).toEqual([]);
  });

  it('never overwrites: it keeps both and names the restored one', async () => {
    const made = await scenario();
    await put(made.dir, 'a.txt', OLD);
    const first = await trashed(made, 'a.txt');
    await put(made.dir, 'a.txt', 'someone else');
    const one = await restoreFromTrash(env(), made.root, first);
    expect(one.relPath).toBe('a (restored).txt');
    await put(made.dir, 'b.txt', NEW);
    const second = await trashed(made, 'b.txt');
    await put(made.dir, 'b.txt', 'again');
    await put(made.dir, 'b (restored).txt', 'taken');
    const two = await restoreFromTrash(env(), made.root, second);
    expect(two.relPath).toBe('b (restored 2).txt');
    expect(await text(made.dir, 'a.txt')).toBe('someone else');
    expect(await text(made.dir, 'a (restored).txt')).toBe(OLD);
    expect(await text(made.dir, 'b.txt')).toBe('again');
    expect(await text(made.dir, 'b (restored).txt')).toBe('taken');
    expect(await text(made.dir, 'b (restored 2).txt')).toBe(NEW);
  });

  it('names a restored folder without an extension split', async () => {
    const made = await scenario();
    await put(made.dir, 'v1.2/x.txt', OLD);
    const entry = await trashed(made, 'v1.2', true);
    await put(made.dir, 'v1.2/y.txt', 'new');
    const restored = await restoreFromTrash(env(), made.root, entry);
    expect(restored.relPath).toBe('v1.2 (restored)');
    expect(await text(made.dir, 'v1.2 (restored)/x.txt')).toBe(OLD);
  });

  it('goes to the top of the root when the original folder is gone', async () => {
    const made = await scenario();
    await put(made.dir, 'gone/a.txt', OLD);
    const entry = await trashed(made, 'gone/a.txt');
    await rm(join(made.dir, 'gone'), { recursive: true });
    expect((await restoreFromTrash(env(), made.root, entry)).relPath).toBe('a.txt');
  });

  it('is rolled back after a crash at every step', async () => {
    const total = await eachCrashPoint(
      async () => {
        const made = await scenario();
        await put(made.dir, 'a.txt', OLD);
        const entry = await trashed(made, 'a.txt');
        await put(made.dir, 'a.txt', 'other');
        return { ...made, entry };
      },
      (made, files) => restoreFromTrash(env(files), made.root, made.entry),
      async (made) => {
        expect(await text(made.dir, made.entry.trashRelPath)).toBe(OLD);
        expect(await text(made.dir, 'a.txt')).toBe('other');
        expect(await text(made.dir, 'a (restored).txt')).toBeNull();
        const manifest = DRIVE_TRASH_ENTRY.parse(
          JSON.parse((await text(made.dir, `${made.entry.trashRelPath}.json`)) ?? ''),
        );
        expect(manifest.itemId).toBe(made.entry.itemId);
        expect(opened.store.driveIntents.all()).toEqual([]);
      },
    );
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it('refuses a read-only root', async () => {
    const made = await scenario(true);
    const entry = {
      itemId: randomUUID(),
      rootId: made.root.id,
      name: 'a.txt',
      originalRelPath: 'a.txt',
      trashRelPath: `${TRASH_DIRECTORY}/x`,
      isFolder: false,
      bytes: 1,
      deletedAt: NOW.toISOString(),
      purgeAt: '2027-11-07T00:00:00.000Z',
      deletedBy: null,
      addedByProfileId: null,
    };
    await expect(restoreFromTrash(env(), made.root, entry)).rejects.toBeInstanceOf(DriveWriteError);
  });
});

describe('committing bytes', () => {
  async function commit(
    made: Scenario,
    files: DriveFiles,
    relPath = 'doc.txt',
  ): Promise<CommittedBytes> {
    const staged = await stageBytes(env(), made.root, source(NEW));
    return commitBytes(env(files), { root: made.root, staged, relPath, previousSha256: OLD_SHA });
  }

  it('moves the old bytes to versions and returns the post-rename stat', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', OLD);
    const done = await commit(made, nodeFiles);
    expect(await text(made.dir, 'doc.txt')).toBe(NEW);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBe(OLD);
    expect(done.captured).toEqual({ sha256: OLD_SHA, relPath: versionRelPath(OLD_SHA) });
    const live = await stat(join(made.dir, 'doc.txt'), { bigint: true });
    expect([done.stamp.dev, done.stamp.ino, done.stamp.mtimeNs]).toEqual([
      live.dev,
      live.ino,
      live.mtimeNs,
    ]);
    expect(done.stamp.size).toBe(NEW.length);
    expect(done.sha256).toBe(createHash('sha256').update(NEW).digest('hex'));
    expect(await names(made.dir, TMP_DIRECTORY)).toEqual([]);
    expect(opened.store.driveIntents.all().map((intent) => intent.id)).toEqual([done.intent.id]);
  });

  it('hashes the live file itself when the caller has no stored hash', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', OLD);
    const staged = await stageBytes(env(), made.root, source(NEW));
    const done = await commitBytes(env(), {
      root: made.root,
      staged,
      relPath: 'doc.txt',
      previousSha256: null,
    });
    expect(done.captured?.sha256).toBe(OLD_SHA);
  });

  it('captures nothing for a new file or a root with versions off', async () => {
    const fresh = await scenario();
    const created = await commit(fresh, nodeFiles);
    expect(created.captured).toBeNull();
    const off = await scenario(false, false);
    await put(off.dir, 'doc.txt', OLD);
    const replaced = await commit(off, nodeFiles);
    expect(replaced.captured).toBeNull();
    expect(await text(off.dir, 'doc.txt')).toBe(NEW);
    expect(await names(off.dir, '.smarteverything/versions')).toEqual([]);
  });

  it('is rolled back or finished after a crash at every step', async () => {
    const total = await eachCrashPoint(
      async () => {
        const made = await scenario();
        await put(made.dir, 'doc.txt', OLD);
        return made;
      },
      (made, files) => commit(made, files),
      async (made) => {
        const live = await text(made.dir, 'doc.txt');
        if (live === OLD) {
          expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
          expect(finished).toEqual([]);
        } else {
          expect(live).toBe(NEW);
          expect(await text(made.dir, versionRelPath(OLD_SHA))).toBe(OLD);
          expect(finished).toEqual(['doc.txt']);
        }
        expect(await names(made.dir, TMP_DIRECTORY)).toEqual([]);
        expect(opened.store.driveIntents.all()).toEqual([]);
      },
    );
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('rolls back a failed rename in the same run and keeps the old file', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', OLD);
    const staged = await stageBytes(env(), made.root, source(NEW));
    let renames = 0;
    const files: DriveFiles = {
      ...nodeFiles,
      rename: async (from, to) => {
        renames += 1;
        if (renames === 2) {
          throw new Error('disk error');
        }
        await nodeFiles.rename(from, to);
      },
    };
    await expect(
      commitBytes(env(files), {
        root: made.root,
        staged,
        relPath: 'doc.txt',
        previousSha256: OLD_SHA,
      }),
    ).rejects.toThrow('disk error');
    expect(await text(made.dir, 'doc.txt')).toBe(OLD);
    expect(await names(made.dir, '.smarteverything/versions')).toEqual([OLD_SHA.slice(0, 2)]);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
    expect(opened.store.driveIntents.all()).toEqual([]);
  });

  it('puts a shared version back by link when it cannot be moved', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', OLD);
    await put(made.dir, versionRelPath(OLD_SHA), OLD);
    opened.store.driveVersions.insert(
      made.root.id,
      newVersion(env(), {
        itemId: randomUUID(),
        rev: 1,
        sha256: OLD_SHA,
        bytes: OLD.length,
        actorProfileId: null,
        via: 'app',
        deviceId: null,
        addedByProfileId: null,
      }),
    );
    const staged = await stageBytes(env(), made.root, source(NEW));
    const files = crashing(4).files;
    await expect(
      commitBytes(env(files), {
        root: made.root,
        staged,
        relPath: 'doc.txt',
        previousSha256: OLD_SHA,
      }),
    ).rejects.toThrow(Crash);
    await recoverIntents(recovery(), [made.root]);
    expect(await text(made.dir, 'doc.txt')).toBe(OLD);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBe(OLD);
  });

  it('refuses a read-only root before staging anything', async () => {
    const made = await scenario(true);
    await expect(stageBytes(env(), made.root, source(NEW))).rejects.toMatchObject({
      failure: 'read-only',
    });
    expect(await names(made.dir, TMP_DIRECTORY)).toEqual([]);
  });

  it('refuses a folder where the file should go', async () => {
    const made = await scenario();
    await mkdir(join(made.dir, 'doc.txt'));
    const staged = await stageBytes(env(), made.root, source(NEW));
    await expect(
      commitBytes(env(), { root: made.root, staged, relPath: 'doc.txt', previousSha256: null }),
    ).rejects.toMatchObject({ failure: 'exists' });
    expect(opened.store.driveIntents.all()).toEqual([]);
  });
});

describe('start-up recovery', () => {
  it('removes orphan tmp files', async () => {
    const made = await scenario();
    await put(made.dir, `${TMP_DIRECTORY}/stale`, 'partial');
    const report = await recoverIntents(recovery(), [made.root]);
    expect(report).toEqual({ rolledBack: 0, completed: 0, tmpRemoved: 1, failed: 0 });
    expect(await names(made.dir, TMP_DIRECTORY)).toEqual([]);
  });

  it('removes version files that no row references', async () => {
    const made = await scenario();
    await put(made.dir, versionRelPath(OLD_SHA), OLD);
    expect(await sweepOrphanVersionsAtStart(env(), made.root)).toBe(1);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
  });

  it('rolls back a standalone version capture after a crash at every step', async () => {
    const total = await eachCrashPoint(
      async () => {
        const made = await scenario();
        await put(made.dir, 'doc.txt', OLD);
        return made;
      },
      (made, files) => captureVersion(env(files), made.root, 'doc.txt', OLD_SHA),
      async (made) => {
        expect(await text(made.dir, 'doc.txt')).toBe(OLD);
        expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
        expect(opened.store.driveIntents.all()).toEqual([]);
      },
    );
    expect(total).toBeGreaterThanOrEqual(2);
  });
});

describe('versions', () => {
  function row(root: Scenario, itemId: string, rev: number, sha256: string): DriveVersionEntry {
    return opened.store.driveVersions.insert(
      root.root.id,
      newVersion(env(), {
        itemId,
        rev,
        sha256,
        bytes: 1,
        actorProfileId: null,
        via: 'app',
        deviceId: null,
        addedByProfileId: null,
      }),
    );
  }

  it('unlinks a shared version file only when its last row is purged', async () => {
    const made = await scenario();
    await put(made.dir, versionRelPath(OLD_SHA), OLD);
    const first = row(made, randomUUID(), 1, OLD_SHA);
    const second = row(made, randomUUID(), 1, OLD_SHA);
    await purgeVersions(env(), [first.version.id]);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBe(OLD);
    await purgeVersions(env(), [second.version.id]);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
    expect(await purgeVersions(env(), [])).toEqual([]);
  });

  it('gives a version a 365 day window', async () => {
    const made = await scenario();
    expect(row(made, randomUUID(), 1, OLD_SHA).version.purgeAt).toBe('2027-11-07T00:00:00.000Z');
  });

  it('restores a version as a new commit that captures the current bytes', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', NEW);
    await put(made.dir, versionRelPath(OLD_SHA), OLD);
    const version = row(made, randomUUID(), 1, OLD_SHA).version;
    const staged = await stageVersion(env(), made.root, version);
    const newSha = createHash('sha256').update(NEW).digest('hex');
    const done = await commitBytes(env(), {
      root: made.root,
      staged,
      relPath: 'doc.txt',
      previousSha256: newSha,
    });
    expect(await text(made.dir, 'doc.txt')).toBe(OLD);
    expect(await text(made.dir, versionRelPath(newSha))).toBe(NEW);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBe(OLD);
    expect(done.captured?.sha256).toBe(newSha);
  });

  it('refuses to restore a version whose bytes no longer match', async () => {
    const made = await scenario();
    await put(made.dir, versionRelPath(OLD_SHA), 'tampered');
    const version = row(made, randomUUID(), 1, OLD_SHA).version;
    await expect(stageVersion(env(), made.root, version)).rejects.toMatchObject({
      failure: 'corrupt',
    });
    expect(await names(made.dir, TMP_DIRECTORY)).toEqual([]);
  });
});

describe('delete and versions', () => {
  it('creates no version on delete and keeps the item versions until the trash entry is removed', async () => {
    const made = await scenario();
    await put(made.dir, 'doc.txt', NEW);
    await put(made.dir, versionRelPath(OLD_SHA), OLD);
    const itemId = randomUUID();
    opened.store.driveVersions.insert(
      made.root.id,
      newVersion(env(), {
        itemId,
        rev: 1,
        sha256: OLD_SHA,
        bytes: OLD.length,
        actorProfileId: null,
        via: 'app',
        deviceId: null,
        addedByProfileId: null,
      }),
    );
    const move = await moveToTrash(env(), made.root, {
      itemId,
      relPath: 'doc.txt',
      name: 'doc.txt',
      isFolder: false,
      bytes: NEW.length,
      deletedBy: null,
      addedByProfileId: null,
    });
    opened.store.write(() => {
      opened.store.driveTrash.insert(move.entry);
      opened.store.driveIntents.clear(move.intent.id);
    });
    expect(await names(made.dir, '.smarteverything/versions')).toEqual([OLD_SHA.slice(0, 2)]);
    expect(opened.store.driveVersions.forItem(itemId, null, 10).versions).toHaveLength(1);
    expect(
      await text(made.dir, versionRelPath(createHash('sha256').update(NEW).digest('hex'))),
    ).toBeNull();
    await removeTrashEntry(env(), move.entry);
    expect(opened.store.driveTrash.find(itemId)).toBeUndefined();
    expect(opened.store.driveVersions.forItem(itemId, null, 10).versions).toEqual([]);
    expect(await text(made.dir, versionRelPath(OLD_SHA))).toBeNull();
    expect(await text(made.dir, move.entry.trashRelPath)).toBeNull();
    expect(await text(made.dir, `${move.entry.trashRelPath}.json`)).toBeNull();
  });
});
