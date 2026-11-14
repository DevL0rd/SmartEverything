import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import {
  DRIVE_CHANGE,
  DRIVE_ROOT_ADD,
  type DriveChange,
  type DriveConflict,
  type DriveBackupReport,
  type DriveConflictResolution,
  type DriveItem,
  type DriveRoot,
  type DriveRootAdd,
  type DriveScrubState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveAlbumsService } from '../../src/drive/albums';
import { commitContent, folderDraft, identityOf, isoOf, recordItem } from '../../src/drive/changes';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveWriteService } from '../../src/drive/service-write';
import type { DriveCaller } from '../../src/drive/service-write-support';
import { DriveShares } from '../../src/drive/shares';
import { stageBytes, fileEnv, nodeFiles } from '../../src/drive/versions';
import { systemProbe, type VolumeSpace } from '../../src/drive/volumes';
import type { DriveQuotaStatus } from '../../src/store/repositories/drive-quotas';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');

let opened: TestStore;
let base = '';
let installDirectory = '';
let service: DriveWriteService;
let ownerId = '';
let memberId = '';
let scans: string[] = [];
let purges = 0;
let conflictRows: Map<string, DriveConflict>;
let scrubStarts = 0;

function caller(profileId: string, owner: boolean, via: DriveCaller['via'] = 'app'): DriveCaller {
  return { profileId, owner, via, deviceId: null };
}

function owner(via: DriveCaller['via'] = 'app'): DriveCaller {
  return caller(ownerId, true, via);
}

function member(): DriveCaller {
  return caller(memberId, false);
}

function addRequest(path: string, fields: Partial<DriveRootAdd> = {}): DriveRootAdd {
  return DRIVE_ROOT_ADD.parse({
    kind: 'folder',
    path,
    label: 'Library',
    scope: 'home',
    ownerProfileId: null,
    readOnly: false,
    versions: true,
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    ...fields,
  });
}

async function newDirectory(name: string): Promise<string> {
  const path = join(base, name);
  await mkdir(path, { recursive: true });
  return realpath(path);
}

async function addRoot(name: string, fields: Partial<DriveRootAdd> = {}): Promise<DriveRoot> {
  return service.addRoot(owner(), addRequest(await newDirectory(name), fields));
}

function pathOf(root: DriveRoot): string {
  if (root.path === null) {
    throw new Error('the root has no path');
  }
  return root.path;
}

function managedRoot(root: DriveRoot, path: string): Extract<DriveRoot, { kind: 'managed' }> {
  if (root.kind !== 'folder') {
    throw new Error('this test manages a folder root');
  }
  return { ...root, kind: 'managed', id: randomUUID(), path, volume: null, readOnly: false };
}

function changeEnv(): ConflictEnv {
  return {
    ...fileEnv(opened.store, testLogger('drive'), () => NOW),
    store: opened.store,
    purge: {
      rearm: (): void => {
        purges += 1;
      },
    },
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

async function seedFolder(root: DriveRoot, relPath: string): Promise<DriveItem> {
  const path = join(pathOf(root), relPath);
  await mkdir(path, { recursive: true });
  const stamp = await nodeFiles.stamp(path);
  if (stamp === null) throw new Error('folder missing');
  const slash = relPath.lastIndexOf('/');
  const parent =
    slash < 0 ? undefined : opened.store.driveItems.byPath(root.id, relPath.slice(0, slash), null);
  return recordItem(changeEnv(), {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: parent?.id ?? null,
        relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: NOW.toISOString(),
        outside: false,
        addedByProfileId: ownerId,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor: { actorProfileId: ownerId, via: 'app', deviceId: null },
  });
}

async function seedFile(
  root: DriveRoot,
  relPath: string,
  text: string,
  by: string = ownerId,
): Promise<DriveItem> {
  const writable = { id: root.id, path: pathOf(root), readOnly: false, versions: root.versions };
  const staged = await stageBytes(changeEnv(), writable, Readable.from([Buffer.from(text)]));
  const written = await commitContent(changeEnv(), {
    root: writable,
    staged,
    relPath,
    actor: { actorProfileId: by, via: 'app', deviceId: null },
  });
  return written.item;
}

async function textOf(root: DriveRoot, relPath: string): Promise<string> {
  return readFile(join(pathOf(root), relPath), 'utf8');
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

function change(value: DriveChange): DriveChange {
  return DRIVE_CHANGE.parse(value);
}

beforeEach(async () => {
  opened = await testStore(() => NOW);
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-write-')));
  installDirectory = await newDirectory('install');
  ownerId = opened.store.profiles.first().id;
  memberId = opened.store.profiles.create({ name: 'Sam' }).id;
  scans = [];
  purges = 0;
  scrubStarts = 0;
  conflictRows = new Map();
  const read = new DriveReadService(opened.store);
  const env = changeEnv();
  service = new DriveWriteService({
    env,
    store: opened.store,
    read,
    albums: new DriveAlbumsService({
      albums: opened.store.driveAlbums,
      items: opened.store.driveItems,
      roots: opened.store.driveRoots,
      runner: { rows: (): [] => [], count: (): number => 0 },
      newId: randomUUID,
      now: (): string => NOW.toISOString(),
      timeZone: 'UTC',
    }),
    shares: new DriveShares({
      store: opened.store,
      origin: (): { url: string; public: boolean } => ({
        url: 'http://hub.local:8080',
        public: false,
      }),
      now: (): Date => NOW,
    }),
    scrub: {
      start: (): DriveScrubState => {
        scrubStarts += 1;
        return { state: 'idle', lastFinishedAt: null, corrupt: 0 };
      },
    },
    backups: { report: (input): DriveBackupReport => opened.store.driveBackups.record(input) },
    guard: {
      status: (profileId): DriveQuotaStatus => opened.store.driveQuotas.status(profileId),
      space: (): Promise<VolumeSpace> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    probe: systemProbe,
    layout: opened.layout,
    installDirectory,
    newId: randomUUID,
    scan: (rootId): void => {
      scans.push(rootId);
    },
  });
});

afterEach(async () => {
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('library folders', () => {
  it('adds a writable folder through the placement check and marks it', async () => {
    const root = await addRoot('docs');
    expect(root).toMatchObject({ kind: 'folder', state: 'scanning', readOnly: false });
    expect(scans).toEqual([root.id]);
    expect(await exists(join(pathOf(root), '.smarteverything', 'root.json'))).toBe(true);
    expect(opened.store.driveRoots.find(root.id)).toBeDefined();
  });

  it('keeps a read-only folder untouched and records its identity beside the database', async () => {
    const root = await addRoot('movies', { readOnly: true, versions: false });
    expect(await exists(join(pathOf(root), '.smarteverything'))).toBe(false);
    expect(await exists(join(opened.directory, 'drive-meta', root.id, 'root.json'))).toBe(true);
  });

  it('refuses a folder inside or containing the hub data, the install or another root', async () => {
    const inside = join(opened.directory, 'inner');
    await mkdir(inside);
    await expect(service.addRoot(owner(), addRequest(inside))).rejects.toMatchObject({
      reason: 'inside-hub-data',
    });
    await expect(service.addRoot(owner(), addRequest(installDirectory))).rejects.toMatchObject({
      reason: 'inside-install',
    });
    const existing = await addRoot('lib/a');
    const nested = await newDirectory('lib/a/b');
    await expect(service.addRoot(owner(), addRequest(nested))).rejects.toMatchObject({
      reason: 'inside-existing',
    });
    await expect(
      service.addRoot(owner(), addRequest(await newDirectory('lib'))),
    ).rejects.toMatchObject({ reason: 'contains-existing' });
    expect(opened.store.driveRoots.list().map((root) => root.id)).toEqual([existing.id]);
  });

  it('leaves no row behind when the identity record cannot be written', async () => {
    const path = await newDirectory('taken');
    await mkdir(join(path, '.smarteverything'));
    await writeFile(join(path, '.smarteverything', 'root.json'), '{}');
    await expect(service.addRoot(owner(), addRequest(path))).rejects.toMatchObject({
      failure: 'exists',
    });
    expect(opened.store.driveRoots.list()).toEqual([]);
  });

  it('lets only the owner add, change, remove and scan', async () => {
    const root = await addRoot('docs');
    const path = await newDirectory('other');
    await expect(service.addRoot(member(), addRequest(path))).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.updateRoot(member(), root.id, { label: 'x' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.removeRoot(member(), root.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(() => {
      service.scanRoot(member(), root.id);
    }).toThrow(expect.objectContaining({ code: 'forbidden' }));
  });

  it('allows edits by writing the marker and dropping the linked record, and back', async () => {
    const root = await addRoot('movies', { readOnly: true, versions: false });
    const updated = await service.updateRoot(owner(), root.id, { readOnly: false, versions: true });
    expect(updated).toMatchObject({ readOnly: false, versions: true });
    expect(await exists(join(pathOf(root), '.smarteverything', 'root.json'))).toBe(true);
    expect(await exists(join(opened.directory, 'drive-meta', root.id))).toBe(false);
    const locked = await service.updateRoot(owner(), root.id, { readOnly: true });
    expect(locked).toMatchObject({ readOnly: true, versions: false });
    expect(await exists(join(opened.directory, 'drive-meta', root.id, 'root.json'))).toBe(true);
  });

  it('refuses versions on a read-only folder', async () => {
    const root = await addRoot('movies', { readOnly: true, versions: false });
    await expect(service.updateRoot(owner(), root.id, { versions: true })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('keeps sync settings only while the folder syncs and rescans on pattern changes', async () => {
    const root = await addRoot('docs');
    await expect(
      service.updateRoot(owner(), root.id, { ignorePatterns: ['*.tmp'] }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const synced = await service.updateRoot(owner(), root.id, {
      synced: true,
      ignorePatterns: ['*.tmp'],
    });
    expect(synced).toMatchObject({ synced: true, sync: { ignorePatterns: ['*.tmp'] } });
    const before = scans.length;
    await service.updateRoot(owner(), root.id, { skipPatterns: ['node_modules'] });
    expect(scans.length).toBe(before + 1);
    const off = await service.updateRoot(owner(), root.id, { synced: false });
    expect(off.synced).toBe(false);
  });

  it('removes a folder root, its marker and its record, and keeps the files', async () => {
    const root = await addRoot('docs');
    await writeFile(join(pathOf(root), 'keep.txt'), 'keep');
    await service.removeRoot(owner(), root.id);
    expect(opened.store.driveRoots.find(root.id)).toBeUndefined();
    expect(await exists(join(pathOf(root), '.smarteverything', 'root.json'))).toBe(false);
    expect(await textOf(root, 'keep.txt')).toBe('keep');
    expect(purges).toBe(1);
  });

  it('never removes a managed folder and keeps it writable', async () => {
    const root = await addRoot('docs');
    const managed = managedRoot(root, await newDirectory('managed'));
    opened.store.driveRoots.insert(managed);
    await expect(service.removeRoot(owner(), managed.id)).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(service.updateRoot(owner(), managed.id, { readOnly: true })).rejects.toMatchObject(
      { code: 'invalid_request' },
    );
    expect(opened.store.driveRoots.byId(managed.id).readOnly).toBe(false);
    expect(await stat(pathOf(managed))).toBeDefined();
  });
});

describe('changes in the tree', () => {
  it('makes a folder on disk with a create row and reports a name clash', async () => {
    const root = await addRoot('docs');
    const top = await seedFolder(root, 'top');
    const made = await service.change(
      owner(),
      change({ action: 'new_folder', parentId: top.id, name: 'sub' }),
    );
    expect(made.failed).toEqual([]);
    const created = opened.store.driveItems.byPath(root.id, 'top/sub', null);
    expect(created).toMatchObject({ kind: 'folder', parentId: top.id, addedByProfileId: ownerId });
    expect(made.done).toEqual([{ itemId: top.id, resultItemId: created?.id }]);
    expect((await stat(join(pathOf(root), 'top', 'sub'))).isDirectory()).toBe(true);
    const again = await service.change(
      owner(),
      change({ action: 'new_folder', parentId: top.id, name: 'sub' }),
    );
    expect(again.conflicts).toEqual([{ itemId: top.id, name: 'sub', existingItemId: created?.id }]);
  });

  it('renames a file keeping its id and a folder with everything inside it', async () => {
    const root = await addRoot('docs');
    const top = await seedFolder(root, 'top');
    const deep = await seedFolder(root, 'top/deep');
    const inside = await seedFile(root, 'top/deep/a.txt', 'a');
    const renamed = await service.change(
      owner(),
      change({ action: 'rename', itemId: top.id, name: 'renamed' }),
    );
    expect(renamed.failed).toEqual([]);
    expect(opened.store.driveItems.byId(top.id, null)).toMatchObject({
      relPath: 'renamed',
      name: 'renamed',
      rev: 2,
    });
    expect(opened.store.driveItems.byId(deep.id, null)).toMatchObject({
      relPath: 'renamed/deep',
      parentId: top.id,
    });
    expect(opened.store.driveItems.byId(inside.id, null)).toMatchObject({
      relPath: 'renamed/deep/a.txt',
      rev: 2,
    });
    expect(await textOf(root, 'renamed/deep/a.txt')).toBe('a');
    expect(await exists(join(pathOf(root), 'top'))).toBe(false);
    const rows = opened.store.driveFeed.ofItem(inside.id, 0, 10).rows.map((row) => row.op);
    expect(rows).toEqual(['create', 'rename']);
    await service.change(owner(), change({ action: 'rename', itemId: inside.id, name: 'b.txt' }));
    expect(await textOf(root, 'renamed/deep/b.txt')).toBe('a');
    expect(opened.store.driveItems.byId(inside.id, null).id).toBe(inside.id);
  });

  it('reports a rename onto an existing name as a conflict and changes nothing', async () => {
    const root = await addRoot('docs');
    await seedFile(root, 'a.txt', 'a');
    const other = await seedFile(root, 'b.txt', 'b');
    const result = await service.change(
      owner(),
      change({ action: 'rename', itemId: other.id, name: 'a.txt' }),
    );
    expect(result.conflicts).toHaveLength(1);
    expect(await textOf(root, 'b.txt')).toBe('b');
  });

  it('moves into a folder, refuses another root and a folder into itself', async () => {
    const first = await addRoot('one');
    const second = await addRoot('two');
    const target = await seedFolder(first, 'target');
    const file = await seedFile(first, 'a.txt', 'a');
    const foreign = await seedFolder(second, 'foreign');
    const moved = await service.change(
      owner(),
      change({ action: 'move', itemIds: [file.id], toFolderId: target.id }),
    );
    expect(moved.done).toEqual([{ itemId: file.id, resultItemId: file.id }]);
    expect(await textOf(first, 'target/a.txt')).toBe('a');
    expect(opened.store.driveFeed.ofItem(file.id, 0, 10).rows.at(-1)?.op).toBe('move');
    const across = await service.change(
      owner(),
      change({ action: 'move', itemIds: [file.id], toFolderId: foreign.id }),
    );
    expect(across.failed[0]?.reason).toMatch(/inside one library folder/u);
    const nested = await seedFolder(first, 'target/inner');
    const into = await service.change(
      owner(),
      change({ action: 'move', itemIds: [target.id], toFolderId: nested.id }),
    );
    expect(into.failed[0]?.reason).toMatch(/into itself/u);
    expect(await exists(join(pathOf(first), 'target'))).toBe(true);
  });

  it('copies a file and a folder, charging the writer, and reports clashes', async () => {
    const root = await addRoot('docs');
    const source = await seedFolder(root, 'source');
    await seedFile(root, 'source/a.txt', 'hello');
    const destination = await seedFolder(root, 'dest');
    const result = await service.change(
      caller(memberId, false),
      change({ action: 'copy', itemIds: [source.id], toFolderId: destination.id }),
    );
    expect(result.failed).toEqual([]);
    const copied = opened.store.driveItems.byPath(root.id, 'dest/source/a.txt', null);
    expect(copied).toMatchObject({ bytes: 5, addedByProfileId: memberId });
    expect(await textOf(root, 'dest/source/a.txt')).toBe('hello');
    expect(await textOf(root, 'source/a.txt')).toBe('hello');
    const again = await service.change(
      owner(),
      change({ action: 'copy', itemIds: [source.id], toFolderId: destination.id }),
    );
    expect(again.conflicts).toHaveLength(1);
  });

  it('refuses a copy that would pass the writer quota and leaves nothing behind', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'big.txt', 'x'.repeat(100));
    const destination = await seedFolder(root, 'dest');
    opened.store.driveQuotas.set(memberId, 50);
    const result = await service.change(
      member(),
      change({ action: 'copy', itemIds: [file.id], toFolderId: destination.id }),
    );
    expect(result.done).toEqual([]);
    expect(result.failed[0]?.reason).toMatch(/space limit/u);
    expect(opened.store.driveItems.byPath(root.id, 'dest/big.txt', null)).toBeUndefined();
    expect(await exists(join(pathOf(root), 'dest', 'big.txt'))).toBe(false);
  });

  it('stars and unstars with feed rows, and refuses writes in a read-only folder', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'a');
    await service.change(owner(), change({ action: 'star', itemIds: [file.id] }));
    expect(opened.store.driveItems.byId(file.id, null).starred).toBe(true);
    await service.change(owner(), change({ action: 'unstar', itemIds: [file.id] }));
    expect(opened.store.driveFeed.ofItem(file.id, 0, 10).rows.map((row) => row.op)).toEqual([
      'create',
      'star',
      'unstar',
    ]);
    opened.store.driveRoots.update(root.id, { readOnly: true, versions: false });
    const refused = await service.change(owner(), change({ action: 'trash', itemIds: [file.id] }));
    expect(refused.failed[0]?.reason).toMatch(/read-only/u);
  });

  it('trashes and restores with the same id', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'a');
    const trashed = await service.change(owner(), change({ action: 'trash', itemIds: [file.id] }));
    expect(trashed.done).toHaveLength(1);
    expect(opened.store.driveItems.find(file.id, null)).toBeUndefined();
    expect(opened.store.driveTrash.find(file.id)).toBeDefined();
    const restored = await service.change(
      owner(),
      change({ action: 'restore', itemIds: [file.id] }),
    );
    expect(restored.done).toEqual([{ itemId: file.id, resultItemId: file.id }]);
    expect(await textOf(root, 'a.txt')).toBe('a');
  });

  it('removes from the trash for good only in the app: owner any entry, member only their own', async () => {
    const root = await addRoot('docs');
    const mine = await seedFile(root, 'mine.txt', 'm', memberId);
    const theirs = await seedFile(root, 'theirs.txt', 't', ownerId);
    const ids = [mine.id, theirs.id];
    await service.change(owner(), change({ action: 'trash', itemIds: ids }));
    const byAi = await service.change(owner('ai'), change({ action: 'delete_now', itemIds: ids }));
    expect(byAi.failed.map((one) => one.reason)).toEqual([
      expect.stringMatching(/never by the AI/u),
      expect.stringMatching(/never by the AI/u),
    ]);
    const byMember = await service.change(member(), change({ action: 'delete_now', itemIds: ids }));
    expect(byMember.done.map((one) => one.itemId)).toEqual([mine.id]);
    expect(byMember.failed.map((one) => one.itemId)).toEqual([theirs.id]);
    expect(opened.store.driveTrash.find(theirs.id)).toBeDefined();
    const byOwner = await service.change(
      owner(),
      change({ action: 'delete_now', itemIds: [theirs.id] }),
    );
    expect(byOwner.done).toHaveLength(1);
    expect(opened.store.driveTrash.find(theirs.id)).toBeUndefined();
  });

  it('keeps a member out of another person’s folder', async () => {
    const root = await addRoot('mine', { scope: 'person', ownerProfileId: ownerId });
    const file = await seedFile(root, 'secret.txt', 's');
    const result = await service.change(member(), change({ action: 'trash', itemIds: [file.id] }));
    expect(result.done).toEqual([]);
    expect(result.failed[0]?.reason).toMatch(/no such library folder/u);
    expect(opened.store.driveItems.find(file.id, null)).toBeDefined();
  });

  it('adds files to a manual album and takes them out again', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.jpg', 'a');
    const album = service.createAlbum(owner(), {
      kind: 'manual',
      title: 'Trip',
      surface: 'drive',
      scope: 'home',
      itemIds: [],
    });
    const added = await service.change(
      owner(),
      change({ action: 'album_add', albumId: album.id, itemIds: [file.id] }),
    );
    expect(added.done).toHaveLength(1);
    expect(opened.store.driveAlbums.byId(album.id).itemCount).toBe(1);
    await service.change(
      owner(),
      change({ action: 'album_remove', albumId: album.id, itemIds: [file.id] }),
    );
    expect(opened.store.driveAlbums.byId(album.id).itemCount).toBe(0);
    const renamed = service.updateAlbum(owner(), album.id, { title: 'Holiday' });
    expect(renamed.title).toBe('Holiday');
    service.removeAlbum(owner(), album.id);
    expect(opened.store.driveAlbums.find(album.id)).toBeUndefined();
  });
});

describe('versions, quotas, settings, shares, conflicts and sync devices', () => {
  it('restores an earlier version as a new rev and keeps the replaced bytes', async () => {
    const root = await addRoot('docs');
    const first = await seedFile(root, 'a.txt', 'one');
    await seedFile(root, 'a.txt', 'two!');
    const version = opened.store.driveVersions.forItem(first.id, null, 10).versions[0];
    if (version === undefined) throw new Error('no version');
    const restored = await service.restoreVersion(owner(), first.id, version.id);
    expect(restored).toMatchObject({ id: first.id, rev: 3, bytes: 3 });
    expect(await textOf(root, 'a.txt')).toBe('one');
    expect(opened.store.driveVersions.forItem(first.id, null, 10).versions).toHaveLength(2);
  });

  it('refuses a version of another file and a restore over the quota', async () => {
    const root = await addRoot('docs');
    const first = await seedFile(root, 'a.txt', 'one');
    const other = await seedFile(root, 'b.txt', 'bb');
    await seedFile(root, 'a.txt', 'two!');
    const version = opened.store.driveVersions.forItem(first.id, null, 10).versions[0];
    if (version === undefined) throw new Error('no version');
    await expect(service.restoreVersion(owner(), other.id, version.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    opened.store.driveQuotas.set(memberId, 1);
    await expect(service.restoreVersion(member(), first.id, version.id)).rejects.toMatchObject({
      name: 'DriveQuotaExceededError',
    });
    expect(await textOf(root, 'a.txt')).toBe('two!');
  });

  it('lets only the owner set quotas, settings, scrub and backup reports', () => {
    expect(() => {
      service.setQuota(member(), { profileId: memberId, bytes: 5 });
    }).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(() => service.updateSettings(member(), { membersMayShare: true })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => service.startScrub(member())).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => service.reportBackup(member(), { reporter: 'x', bytes: 1, ok: true })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(scrubStarts).toBe(0);
    service.setQuota(owner(), { profileId: memberId, bytes: 5 });
    expect(opened.store.driveQuotas.find(memberId)?.bytes).toBe(5);
    service.setQuota(owner(), { profileId: memberId, bytes: null });
    expect(opened.store.driveQuotas.find(memberId)).toBeUndefined();
    expect(service.updateSettings(owner(), { membersMayShare: true }).membersMayShare).toBe(true);
    expect(service.startScrub(owner()).state).toBe('idle');
    expect(scrubStarts).toBe(1);
    expect(service.reportBackup(owner(), { reporter: 'job', bytes: 9, ok: true })).toMatchObject({
      reporter: 'job',
      ok: true,
    });
  });

  it('lets a member share only when the owner allows it, and revoke their own links', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'a');
    const input = { itemId: file.id, permission: 'view' as const, expiresAt: null, password: null };
    await expect(service.createShare(member(), input)).rejects.toMatchObject({ code: 'forbidden' });
    service.updateSettings(owner(), { membersMayShare: true });
    const created = await service.createShare(member(), input);
    expect(service.revokeShare(owner(), created.share.id).revokedAt).not.toBeNull();
  });

  it('settles a conflict inside the caller’s reach only', async () => {
    const root = await addRoot('mine', { scope: 'person', ownerProfileId: ownerId });
    const file = await seedFile(root, 'a.txt', 'a');
    const conflict: DriveConflict = {
      id: randomUUID(),
      rootId: root.id,
      itemId: file.id,
      conflictItemId: randomUUID(),
      relPath: 'a.txt',
      conflictRelPath: 'a.sync-conflict.txt',
      hubRev: 1,
      baseRev: 1,
      deviceId: randomUUID(),
      profileId: ownerId,
      at: NOW.toISOString(),
      resolvedAt: null,
      resolution: null,
    };
    conflictRows.set(conflict.id, conflict);
    await expect(
      service.resolveConflict(member(), { conflictId: conflict.id, resolution: 'keep_both' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const settled = await service.resolveConflict(owner(), {
      conflictId: conflict.id,
      resolution: 'keep_both',
    });
    expect(settled.resolution).toBe('keep_both');
  });

  it('updates a sync device of a synced folder, for its own person or the owner', async () => {
    const root = await addRoot('docs');
    const update = { clientId: randomUUID(), rootId: root.id, enabled: true, selected: ['a'] };
    expect(() => service.updateSyncClient(owner(), update)).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
    await service.updateRoot(owner(), root.id, { synced: true });
    expect(() => service.updateSyncClient(owner(), update)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    const client = opened.store.clients.create({
      name: 'Laptop',
      platform: 'desktop',
      role: 'member',
      tokenHash: 'l',
    }).id;
    const device = randomUUID();
    const raw = new DatabaseSync(join(opened.directory, 'test.db'));
    raw
      .prepare(
        `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
          values (?, 'xiaomi', 'e1', 'light', 'Lamp', 'm', 'v', ?, ?)`,
      )
      .run(device, NOW.toISOString(), NOW.toISOString());
    raw.close();
    opened.store.driveSyncClients.set(
      { clientId: client, rootId: root.id, enabled: false, selected: [] },
      { deviceId: device, profileId: ownerId },
    );
    expect(() => service.updateSyncClient(member(), { ...update, clientId: client })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    const saved = service.updateSyncClient(owner(), { ...update, clientId: client });
    expect(saved).toMatchObject({ enabled: true, selected: ['a'], profileId: ownerId });
    expect(opened.store.driveRoots.byId(root.id).sync).toMatchObject({
      clients: [{ clientId: client, enabled: true }],
    });
  });
});
