import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  ApiError,
  DRIVE_ROOT_ADD,
  type DriveBackupReport,
  type DriveItem,
  type DriveRoot,
  type DriveScrubState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveAlbumsService } from '../../src/drive/albums';
import { commitContent, folderDraft, identityOf, isoOf, recordItem } from '../../src/drive/changes';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { DriveFsApi, FS_MKDIR, FS_REMOVE, type FsCaller } from '../../src/drive/fs-api';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveWriteService } from '../../src/drive/service-write';
import { DriveShares } from '../../src/drive/shares';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import { systemProbe, type VolumeSpace } from '../../src/drive/volumes';
import type { DriveQuotaStatus } from '../../src/store/repositories/drive-quotas';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');
let node = '';

let opened: TestStore;
let base = '';
let ownerId = '';
let api: DriveFsApi;
let service: DriveWriteService;

function owner(): FsCaller {
  return { profileId: ownerId, owner: true, nodeId: node };
}

function changeEnv(): ConflictEnv {
  return {
    ...fileEnv(opened.store, testLogger('drive'), () => NOW),
    store: opened.store,
    purge: { rearm: (): void => undefined },
    conflicts: {
      insert: (): void => undefined,
      find: () => undefined,
      resolve: (): never => {
        throw new Error('unused');
      },
    },
  };
}

async function addRoot(name: string, fields: Record<string, unknown> = {}): Promise<DriveRoot> {
  const path = join(base, name);
  await mkdir(path, { recursive: true });
  return service.addRoot(
    { profileId: ownerId, owner: true, via: 'app', deviceId: null },
    DRIVE_ROOT_ADD.parse({
      kind: 'folder',
      path: await realpath(path),
      label: 'Library',
      scope: 'home',
      ownerProfileId: null,
      readOnly: false,
      versions: true,
      inPhotos: false,
      skipPatterns: [],
      includeHidden: false,
      ...fields,
    }),
  );
}

function pathOf(root: DriveRoot): string {
  if (root.path === null) throw new Error('no path');
  return root.path;
}

async function seedFolder(root: DriveRoot, relPath: string): Promise<DriveItem> {
  const path = join(pathOf(root), relPath);
  await mkdir(path, { recursive: true });
  const stamp = await nodeFiles.stamp(path);
  if (stamp === null) throw new Error('missing');
  const slash = relPath.lastIndexOf('/');
  const parent =
    slash < 0 ? undefined : opened.store.driveItems.byPath(root.id, relPath.slice(0, slash));
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

async function seedFile(root: DriveRoot, relPath: string, text: string): Promise<DriveItem> {
  const writable = { id: root.id, path: pathOf(root), readOnly: false, versions: root.versions };
  const staged = await stageBytes(changeEnv(), writable, Readable.from([Buffer.from(text)]));
  const written = await commitContent(changeEnv(), {
    root: writable,
    staged,
    relPath,
    actor: { actorProfileId: ownerId, via: 'app', deviceId: null },
  });
  return written.item;
}

async function refusal(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  opened = await testStore(() => NOW);
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-fs-')));
  ownerId = opened.store.profiles.first().id;
  node = opened.store.clients.create({
    name: 'Mounting computer',
    platform: 'desktop',
    role: 'owner',
    tokenHash: randomUUID(),
  }).id;
  const read = new DriveReadService(opened.store);
  const install = join(base, 'install');
  await mkdir(install);
  service = new DriveWriteService({
    env: changeEnv(),
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
      origin: (): { url: string; public: boolean } => ({ url: 'http://hub.local', public: false }),
      now: (): Date => NOW,
    }),
    scrub: { start: (): DriveScrubState => ({ state: 'idle', lastFinishedAt: null, corrupt: 0 }) },
    backups: { report: (input): DriveBackupReport => opened.store.driveBackups.record(input) },
    guard: {
      status: (profileId): DriveQuotaStatus => opened.store.driveQuotas.status(profileId),
      space: (): Promise<VolumeSpace> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    probe: systemProbe,
    layout: opened.layout,
    installDirectory: install,
    newId: randomUUID,
    scan: (): void => undefined,
  });
  api = new DriveFsApi({
    env: changeEnv(),
    read,
    write: service,
    ops: opened.store.driveSyncOps,
  });
});

afterEach(async () => {
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

let opCount = 0;

function op(): string {
  opCount += 1;
  return `op-${String(opCount)}`;
}

describe('op ids', () => {
  it('answers a repeated mkdir with the first answer and applies it once', async () => {
    const root = await addRoot('docs');
    const input = { opId: op(), parentId: null, name: 'new' };
    const first = await api.mkdir(owner(), root.id, input);
    const second = await api.mkdir(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(opened.store.driveItems.children(root.id, null, null, 10).entries).toHaveLength(1);
    expect((await refusal(() => api.mkdir(owner(), root.id, { ...input, opId: op() }))).code).toBe(
      'conflict',
    );
  });

  it('answers a repeated rename without moving twice', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const input = { opId: op(), itemId: file.id, parentId: null, name: 'b.txt' };
    const first = await api.rename(owner(), root.id, input);
    const second = await api.rename(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(second.name).toBe('b.txt');
    expect(opened.store.driveItems.byId(file.id).rev).toBe(first.rev);
  });

  it('answers a repeated unlink and rmdir that already took effect', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const folder = await seedFolder(root, 'sub');
    const unlink = { opId: op(), itemId: file.id };
    const rmdir = { opId: op(), itemId: folder.id };
    await api.unlink(owner(), root.id, unlink);
    await api.rmdir(owner(), root.id, rmdir);
    await expect(api.unlink(owner(), root.id, unlink)).resolves.toBeUndefined();
    await expect(api.rmdir(owner(), root.id, rmdir)).resolves.toBeUndefined();
    expect(
      (await refusal(() => api.unlink(owner(), root.id, { ...unlink, opId: op() }))).code,
    ).toBe('not_found');
  });

  it('answers a repeated utimens with the first answer', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const input = { opId: op(), itemId: file.id, modifiedAt: '2026-01-02T03:04:05.000Z' };
    const first = await api.utimens(owner(), root.id, input);
    const second = await api.utimens(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(second.modifiedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('refuses an op id reused for another operation', async () => {
    const root = await addRoot('docs');
    const id = op();
    await api.mkdir(owner(), root.id, { opId: id, parentId: null, name: 'x' });
    const folder = opened.store.driveItems.byPath(root.id, 'x');
    const itemId = folder?.id ?? '';
    expect((await refusal(() => api.rmdir(owner(), root.id, { opId: id, itemId }))).code).toBe(
      'conflict',
    );
  });

  it('applies simultaneous duplicates once', async () => {
    const root = await addRoot('docs');
    const input = { opId: op(), parentId: null, name: 'once' };
    const [first, second] = await Promise.all([
      api.mkdir(owner(), root.id, input),
      api.mkdir(owner(), root.id, input),
    ]);
    expect(second).toEqual(first);
  });

  it('does not remember a refused operation', async () => {
    const root = await addRoot('docs');
    const input = { opId: op(), parentId: null, name: 'late' };
    await seedFolder(root, 'late');
    expect((await refusal(() => api.mkdir(owner(), root.id, input))).code).toBe('conflict');
    expect(opened.store.driveSyncOps.recall(node, input.opId)).toBeUndefined();
  });

  it('requires an op id on every mutation', () => {
    expect(FS_MKDIR.safeParse({ base: undefined, parentId: null, name: 'x' }).success).toBe(false);
    expect(FS_REMOVE.safeParse({ itemId: randomUUID() }).success).toBe(false);
  });
});

describe('subtree roots', () => {
  async function mounted(): Promise<{ root: DriveRoot; base: DriveItem; inner: DriveItem }> {
    const root = await addRoot('docs');
    await seedFolder(root, 'roms');
    const base = await seedFolder(root, 'roms/snes');
    await seedFile(root, 'roms/snes/mario.sfc', 'rom');
    await seedFile(root, 'other.txt', 'no');
    const inner = await seedFolder(root, 'roms/snes/hacks');
    return { root, base, inner };
  }

  it('lists from the subtree folder as if it were the root', async () => {
    const { root, base, inner } = await mounted();
    const top = api.list(owner(), root.id, { base: base.id });
    expect(top.folder).toBeNull();
    expect(top.entries.map((entry) => [entry.name, entry.parentId])).toEqual([
      ['hacks', null],
      ['mario.sfc', null],
    ]);
    const deeper = api.list(owner(), root.id, { base: base.id, folder: inner.id });
    expect(deeper.folder?.parentId).toBeNull();
    expect(deeper.folder?.id).toBe(inner.id);
    const again = api.list(owner(), root.id, { base: base.id, folder: base.id });
    expect(again.folder).toBeNull();
  });

  it('refuses items outside the subtree', async () => {
    const { root, base } = await mounted();
    const outside = opened.store.driveItems.byPath(root.id, 'other.txt');
    const parent = opened.store.driveItems.byPath(root.id, 'roms');
    const ids = [outside?.id ?? '', parent?.id ?? '', base.id];
    for (const folder of ids.slice(0, 2)) {
      expect(
        (await refusal(() => api.list(owner(), root.id, { base: base.id, folder }))).code,
      ).toBe('not_found');
    }
    for (const itemId of ids) {
      const rename = { opId: op(), base: base.id, itemId, parentId: null, name: 'z' };
      expect((await refusal(() => api.rename(owner(), root.id, rename))).code).toBe('not_found');
      expect((await refusal(() => api.readable(owner(), root.id, itemId, base.id))).code).toBe(
        'not_found',
      );
    }
  });

  it('refuses a base that is not a folder of this library folder', async () => {
    const { root } = await mounted();
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc');
    const other = await addRoot('second');
    const foreign = await seedFolder(other, 'x');
    for (const base of [file?.id ?? '', foreign.id]) {
      expect((await refusal(() => api.list(owner(), root.id, { base }))).code).toBe('not_found');
    }
  });

  it('stats a path relative to the subtree', async () => {
    const { root, base } = await mounted();
    expect(api.stat(owner(), root.id, { base: base.id, path: 'mario.sfc' })?.name).toBe(
      'mario.sfc',
    );
    expect(api.stat(owner(), root.id, { base: base.id, path: '' })).toBeNull();
    expect(
      (await refusal(() => api.stat(owner(), root.id, { base: base.id, path: 'other.txt' }))).code,
    ).toBe('not_found');
    expect(
      (await refusal(() => api.stat(owner(), root.id, { base: base.id, path: '../other.txt' })))
        .code,
    ).toBe('invalid_request');
  });

  it('writes under the subtree folder with a null parent', async () => {
    const { root, base } = await mounted();
    const made = await api.mkdir(owner(), root.id, {
      opId: op(),
      base: base.id,
      parentId: null,
      name: 'fresh',
    });
    expect(made.parentId).toBeNull();
    expect(opened.store.driveItems.byId(made.id).relPath).toBe('roms/snes/fresh');
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc');
    const moved = await api.rename(owner(), root.id, {
      opId: op(),
      base: base.id,
      itemId: file?.id ?? '',
      parentId: made.id,
      name: 'mario.sfc',
    });
    expect(moved.parentId).toBe(made.id);
    expect(opened.store.driveItems.byId(moved.id).relPath).toBe('roms/snes/fresh/mario.sfc');
  });

  it('refuses a move out of the subtree', async () => {
    const { root, base } = await mounted();
    const outside = opened.store.driveItems.byPath(root.id, 'roms');
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc');
    const rename = {
      opId: op(),
      base: base.id,
      itemId: file?.id ?? '',
      parentId: outside?.id ?? '',
      name: 'mario.sfc',
    };
    expect((await refusal(() => api.rename(owner(), root.id, rename))).code).toBe('not_found');
  });
});
