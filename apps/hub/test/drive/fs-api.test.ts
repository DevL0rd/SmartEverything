import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, utimes } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  ApiError,
  DRIVE_ROOT_ADD,
  matchPath,
  type ComputerNodeRow,
  type DriveBackupReport,
  type DriveItem,
  type DriveRoot,
  type DriveScrubState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveAlbumsService } from '../../src/drive/albums';
import { commitContent, folderDraft, identityOf, isoOf, recordItem } from '../../src/drive/changes';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { DriveFsApi, type FsCaller } from '../../src/drive/fs-api';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveWriteService } from '../../src/drive/service-write';
import { DriveShares } from '../../src/drive/shares';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import { systemProbe, type VolumeSpace } from '../../src/drive/volumes';
import type { DriveQuotaStatus } from '../../src/store/repositories/drive-quotas';
import { driveFsRoutes } from '../../src/server/drive-fs-route';
import { sendError } from '../../src/server/http';
import { MediaLinks } from '../../src/server/media-links';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const TOKEN = 'node-token';

let node = '';
let opened: TestStore;
let base = '';
let ownerId = '';
let memberId = '';
let api: DriveFsApi;
let service: DriveWriteService;

let opCount = 0;

function op(): string {
  opCount += 1;
  return `op-${String(opCount)}`;
}

function owner(): FsCaller {
  return { profileId: ownerId, owner: true, nodeId: node };
}

function member(): FsCaller {
  return { profileId: memberId, owner: false, nodeId: node };
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

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

function lastFeed(): { op: string; via: string; deviceId: string | null } {
  const row = opened.store.driveFeed.latest(
    ['create', 'update', 'rename', 'move', 'restore', 'trash'],
    null,
    1,
  ).rows[0];
  if (row === undefined) throw new Error('no feed row');
  return row;
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
  memberId = opened.store.profiles.create({ name: 'Sam' }).id;
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

describe('list and stat', () => {
  it('lists a folder by parent id with attributes and etags', async () => {
    const root = await addRoot('docs');
    const folder = await seedFolder(root, 'notes');
    const file = await seedFile(root, 'notes/a.txt', 'hello');
    const top = api.list(owner(), root.id, {});
    expect(top.folder).toBeNull();
    expect(top.entries.map((entry) => entry.name)).toEqual(['notes']);
    const page = api.list(owner(), root.id, { folder: folder.id });
    expect(page.folder?.id).toBe(folder.id);
    expect(page.entries).toEqual([
      {
        id: file.id,
        parentId: folder.id,
        name: 'a.txt',
        directory: false,
        size: 5,
        modifiedAt: file.modifiedAt,
        rev: file.rev,
        etag: file.etag,
      },
    ]);
    expect(page.next).toBeNull();
  });

  it('pages a long folder with a cursor', async () => {
    const root = await addRoot('many');
    for (let index = 0; index < 205; index += 1) {
      await seedFolder(root, `d${String(index).padStart(3, '0')}`);
    }
    const first = api.list(owner(), root.id, {});
    expect(first.entries).toHaveLength(200);
    expect(first.next).not.toBeNull();
    const second = api.list(owner(), root.id, { cursor: first.next ?? '' });
    expect(second.entries).toHaveLength(5);
    expect(second.next).toBeNull();
  });

  it('stats by path, answers null for the root and refuses a bad or missing path', async () => {
    const root = await addRoot('docs');
    await seedFolder(root, 'notes');
    const file = await seedFile(root, 'notes/a.txt', 'hello');
    expect(api.stat(owner(), root.id, { path: 'notes/a.txt' })?.id).toBe(file.id);
    expect(api.stat(owner(), root.id, { path: '' })).toBeNull();
    expect((await refusal(() => api.stat(owner(), root.id, { path: 'notes/b.txt' }))).code).toBe(
      'not_found',
    );
    expect((await refusal(() => api.stat(owner(), root.id, { path: '../x' }))).code).toBe(
      'invalid_request',
    );
  });

  it('hides a person root from another member', async () => {
    const root = await addRoot('mine', { scope: 'person', ownerProfileId: ownerId });
    expect(api.list(owner(), root.id, {}).entries).toEqual([]);
    expect((await refusal(() => api.list(member(), root.id, {}))).code).toBe('not_found');
    expect((await refusal(() => api.stat(member(), root.id, { path: '' }))).code).toBe('not_found');
  });
});

describe('mkdir', () => {
  it('makes a folder at the root and inside a folder, recorded via the mount and the device', async () => {
    const root = await addRoot('docs');
    const top = await api.mkdir(owner(), root.id, { opId: op(), parentId: null, name: 'top' });
    expect(top.parentId).toBeNull();
    expect((await stat(join(pathOf(root), 'top'))).isDirectory()).toBe(true);
    expect(lastFeed()).toMatchObject({ op: 'create', via: 'mount', deviceId: node });
    const inner = await api.mkdir(owner(), root.id, {
      opId: op(),
      parentId: top.id,
      name: 'inner',
    });
    expect(inner.parentId).toBe(top.id);
    expect(opened.store.driveItems.byPath(root.id, 'top/inner', null)?.id).toBe(inner.id);
  });

  it('refuses a name already taken, a file parent and a read-only root', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'x');
    await api.mkdir(owner(), root.id, { opId: op(), parentId: null, name: 'top' });
    expect(
      (
        await refusal(() =>
          api.mkdir(owner(), root.id, { opId: op(), parentId: null, name: 'top' }),
        )
      ).code,
    ).toBe('conflict');
    expect(
      (
        await refusal(() =>
          api.mkdir(owner(), root.id, { opId: op(), parentId: file.id, name: 'x' }),
        )
      ).code,
    ).toBe('invalid_request');
    const readOnly = await addRoot('ro', { readOnly: true, versions: false });
    expect(
      (
        await refusal(() =>
          api.mkdir(owner(), readOnly.id, { opId: op(), parentId: null, name: 'x' }),
        )
      ).code,
    ).toBe('forbidden');
  });
});

describe('rename', () => {
  it('renames in place, keeping the item and its bytes', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const renamed = await api.rename(owner(), root.id, {
      opId: op(),
      itemId: file.id,
      parentId: null,
      name: 'b.txt',
    });
    expect(renamed.id).toBe(file.id);
    expect(await readFile(join(pathOf(root), 'b.txt'), 'utf8')).toBe('hello');
    expect(await exists(join(pathOf(root), 'a.txt'))).toBe(false);
    expect(lastFeed()).toMatchObject({ op: 'rename', via: 'mount', deviceId: node });
  });

  it('moves between folders and to the root in one step, children following a folder', async () => {
    const root = await addRoot('docs');
    const from = await seedFolder(root, 'from');
    const to = await seedFolder(root, 'to');
    const file = await seedFile(root, 'from/a.txt', 'hello');
    const moved = await api.rename(owner(), root.id, {
      opId: op(),
      itemId: from.id,
      parentId: to.id,
      name: 'inside',
    });
    expect(moved.parentId).toBe(to.id);
    expect(lastFeed()).toMatchObject({ op: 'move', via: 'mount', deviceId: node });
    expect(opened.store.driveItems.byId(file.id, null).relPath).toBe('to/inside/a.txt');
    await api.rename(owner(), root.id, {
      opId: op(),
      itemId: file.id,
      parentId: null,
      name: 'a.txt',
    });
    expect(await readFile(join(pathOf(root), 'a.txt'), 'utf8')).toBe('hello');
    expect(opened.store.driveItems.byId(file.id, null).parentId).toBeNull();
  });

  it('refuses a clash, a folder into itself and an item of another root', async () => {
    const root = await addRoot('docs');
    const other = await addRoot('other');
    const a = await seedFile(root, 'a.txt', '1');
    await seedFile(root, 'b.txt', '2');
    const folder = await seedFolder(root, 'f');
    const child = await seedFolder(root, 'f/g');
    const foreign = await seedFile(other, 'z.txt', '3');
    expect(
      (
        await refusal(() =>
          api.rename(owner(), root.id, { opId: op(), itemId: a.id, parentId: null, name: 'b.txt' }),
        )
      ).code,
    ).toBe('conflict');
    expect(await readFile(join(pathOf(root), 'a.txt'), 'utf8')).toBe('1');
    expect(
      (
        await refusal(() =>
          api.rename(owner(), root.id, {
            opId: op(),
            itemId: folder.id,
            parentId: child.id,
            name: 'f',
          }),
        )
      ).code,
    ).toBe('invalid_request');
    expect(
      (
        await refusal(() =>
          api.rename(owner(), root.id, {
            opId: op(),
            itemId: foreign.id,
            parentId: null,
            name: 'y',
          }),
        )
      ).code,
    ).toBe('not_found');
  });
});

describe('unlink and rmdir', () => {
  it('unlinks a file into the trash and refuses a folder', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const folder = await seedFolder(root, 'f');
    expect(
      (await refusal(() => api.unlink(owner(), root.id, { opId: op(), itemId: folder.id }))).code,
    ).toBe('invalid_request');
    await api.unlink(owner(), root.id, { opId: op(), itemId: file.id });
    expect(opened.store.driveItems.find(file.id, null)).toBeUndefined();
    expect(await exists(join(pathOf(root), 'a.txt'))).toBe(false);
    expect(opened.store.driveTrash.find(file.id)).toBeDefined();
  });

  it('removes an empty folder, refusing a non-empty one and a file', async () => {
    const root = await addRoot('docs');
    const full = await seedFolder(root, 'full');
    const file = await seedFile(root, 'full/a.txt', 'x');
    const empty = await seedFolder(root, 'empty');
    expect(
      (await refusal(() => api.rmdir(owner(), root.id, { opId: op(), itemId: full.id }))).code,
    ).toBe('conflict');
    expect(
      (await refusal(() => api.rmdir(owner(), root.id, { opId: op(), itemId: file.id }))).code,
    ).toBe('invalid_request');
    await api.rmdir(owner(), root.id, { opId: op(), itemId: empty.id });
    expect(opened.store.driveItems.find(empty.id, null)).toBeUndefined();
    expect(await exists(join(pathOf(root), 'empty'))).toBe(false);
  });

  it('refuses a removal in a read-only root', async () => {
    const root = await addRoot('ro');
    const file = await seedFile(root, 'a.txt', 'x');
    const folder = await seedFolder(root, 'd');
    opened.store.driveRoots.update(root.id, { readOnly: true, versions: false });
    expect(
      (await refusal(() => api.unlink(owner(), root.id, { opId: op(), itemId: file.id }))).code,
    ).toBe('forbidden');
    expect(
      (await refusal(() => api.rmdir(owner(), root.id, { opId: op(), itemId: folder.id }))).code,
    ).toBe('forbidden');
    expect(await exists(join(pathOf(root), 'a.txt'))).toBe(true);
  });
});

describe('utimens', () => {
  it('sets the modified time on disk and in the index, recorded via the mount', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const at = '2020-01-02T03:04:05.000Z';
    const entry = await api.utimens(owner(), root.id, {
      opId: op(),
      itemId: file.id,
      modifiedAt: at,
    });
    expect(entry.modifiedAt).toBe(at);
    expect(entry.rev).toBe(file.rev + 1);
    expect((await stat(join(pathOf(root), 'a.txt'))).mtime.toISOString()).toBe(at);
    expect(lastFeed()).toMatchObject({ op: 'update', via: 'mount', deviceId: node });
    expect(opened.store.driveItems.byId(file.id, null).bytes).toBe(5);
  });

  it('records no change when the time is already that time', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    await utimes(join(pathOf(root), 'a.txt'), new Date(file.modifiedAt), new Date(file.modifiedAt));
    const entry = await api.utimens(owner(), root.id, {
      opId: op(),
      itemId: file.id,
      modifiedAt: file.modifiedAt,
    });
    expect(entry.rev).toBe(file.rev);
  });
});

describe('routes', () => {
  let server: Server;
  let url = '';

  beforeEach(async () => {
    const routes = driveFsRoutes({
      api,
      files: {
        store: opened.store,
        links: new MediaLinks(() => NOW),
        now: () => NOW,
        nodes: {
          authenticate: (token): ComputerNodeRow => {
            if (token !== TOKEN) throw new ApiError('unauthorized', 'Unknown computer.');
            return {
              device_id: node,
              machine_id: '0'.repeat(32),
              hub_url: 'http://hub.local',
              paired_at: NOW.toISOString(),
              revoked_at: null,
            };
          },
          actorOf: () => ({ profileId: ownerId, owner: true }),
        },
      },
    });
    server = createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://x').pathname;
      const route = routes.find(
        (candidate) =>
          candidate.method === request.method && matchPath(candidate.path, pathname) !== null,
      );
      const params = route === undefined ? null : matchPath(route.path, pathname);
      if (route === undefined || params === null) {
        response.writeHead(404).end();
        return;
      }
      route.handle(request, response, params).catch((cause: unknown) => {
        if (cause instanceof ApiError) sendError(response, cause);
        else response.writeHead(500).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    url = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  function call(
    path: string,
    init: { method?: string; token?: string; body?: unknown; range?: string } = {},
  ): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.range === undefined ? {} : { range: init.range }),
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  it('refuses a missing or wrong node token', async () => {
    const root = await addRoot('docs');
    expect((await call(`/drive/fs/${root.id}/list`)).status).toBe(401);
    expect((await call(`/drive/fs/${root.id}/list`, { token: 'wrong' })).status).toBe(401);
  });

  it('lists, stats, makes a folder, renames and removes through the node token', async () => {
    const root = await addRoot('docs');
    const file = await seedFile(root, 'a.txt', 'hello');
    const listed = await call(`/drive/fs/${root.id}/list`, { token: TOKEN });
    expect(await listed.json()).toMatchObject({ entries: [{ name: 'a.txt', size: 5 }] });
    const stated = await call(`/drive/fs/${root.id}/stat?path=a.txt`, { token: TOKEN });
    expect(await stated.json()).toMatchObject({ entry: { id: file.id } });
    const made = await call(`/drive/fs/${root.id}/mkdir`, {
      method: 'POST',
      token: TOKEN,
      body: { opId: op(), parentId: null, name: 'd' },
    });
    expect(made.status).toBe(200);
    expect(lastFeed()).toMatchObject({ via: 'mount', deviceId: node });
    const renamed = await call(`/drive/fs/${root.id}/rename`, {
      method: 'POST',
      token: TOKEN,
      body: { opId: op(), itemId: file.id, parentId: null, name: 'b.txt' },
    });
    expect(await renamed.json()).toMatchObject({ name: 'b.txt' });
    const removed = await call(`/drive/fs/${root.id}/unlink`, {
      method: 'POST',
      token: TOKEN,
      body: { opId: op(), itemId: file.id },
    });
    expect(removed.status).toBe(200);
    expect(await exists(join(pathOf(root), 'b.txt'))).toBe(false);
  });

  it('answers a repeated op id with the first answer and applies it once', async () => {
    const root = await addRoot('docs');
    const body = { opId: op(), parentId: null, name: 'once' };
    const first = await call(`/drive/fs/${root.id}/mkdir`, { method: 'POST', token: TOKEN, body });
    const second = await call(`/drive/fs/${root.id}/mkdir`, { method: 'POST', token: TOKEN, body });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(opened.store.driveItems.children(root.id, null, null, 10).entries).toHaveLength(1);
  });

  it('refuses a mutation without an op id', async () => {
    const root = await addRoot('docs');
    const missing = await call(`/drive/fs/${root.id}/mkdir`, {
      method: 'POST',
      token: TOKEN,
      body: { parentId: null, name: 'x' },
    });
    expect(missing.status).toBe(400);
  });

  it('serves a subtree root through the base folder for list, stat and read', async () => {
    const root = await addRoot('docs');
    const folder = await seedFolder(root, 'sub');
    const file = await seedFile(root, 'sub/a.txt', 'hello');
    const listed = await call(`/drive/fs/${root.id}/list?base=${folder.id}`, { token: TOKEN });
    expect(await listed.json()).toMatchObject({
      folder: null,
      entries: [{ id: file.id, parentId: null, name: 'a.txt' }],
    });
    const stated = await call(`/drive/fs/${root.id}/stat?base=${folder.id}&path=a.txt`, {
      token: TOKEN,
    });
    expect(await stated.json()).toMatchObject({ entry: { id: file.id } });
    const read = await call(`/drive/fs/${root.id}/read/${file.id}?base=${folder.id}`, {
      token: TOKEN,
    });
    expect(await read.text()).toBe('hello');
    const outside = await seedFile(root, 'b.txt', 'no');
    expect(
      (await call(`/drive/fs/${root.id}/read/${outside.id}?base=${folder.id}`, { token: TOKEN }))
        .status,
    ).toBe(404);
  });

  it('refuses a body with an extra field and a clash as 409', async () => {
    const root = await addRoot('docs');
    await seedFolder(root, 'd');
    const extra = await call(`/drive/fs/${root.id}/mkdir`, {
      method: 'POST',
      token: TOKEN,
      body: { opId: op(), parentId: null, name: 'x', mode: 755 },
    });
    expect(extra.status).toBe(400);
    const clash = await call(`/drive/fs/${root.id}/mkdir`, {
      method: 'POST',
      token: TOKEN,
      body: { opId: op(), parentId: null, name: 'd' },
    });
    expect(clash.status).toBe(409);
  });

  it('reads a file with a Range through the node token and refuses a folder or another root', async () => {
    const root = await addRoot('docs');
    const other = await addRoot('other');
    const file = await seedFile(root, 'a.txt', 'hello world');
    const folder = await seedFolder(root, 'd');
    const whole = await call(`/drive/fs/${root.id}/read/${file.id}`, { token: TOKEN });
    expect(await whole.text()).toBe('hello world');
    const part = await call(`/drive/fs/${root.id}/read/${file.id}`, {
      token: TOKEN,
      range: 'bytes=6-10',
    });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('world');
    expect((await call(`/drive/fs/${root.id}/read/${folder.id}`, { token: TOKEN })).status).toBe(
      400,
    );
    expect((await call(`/drive/fs/${other.id}/read/${file.id}`, { token: TOKEN })).status).toBe(
      404,
    );
    expect((await call(`/drive/fs/${root.id}/read/${file.id}`)).status).toBe(401);
  });
});
