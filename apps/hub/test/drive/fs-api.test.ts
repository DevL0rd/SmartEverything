import { lstat, readFile, stat, utimes } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { ApiError, matchPath, type ComputerNodeRow, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveFsApi, FsCaller } from '../../src/drive/fs-api';
import { driveFsRoutes } from '../../src/server/drive-fs-route';
import { sendError } from '../../src/server/http';
import { MediaLinks } from '../../src/server/media-links';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import type { TestStore } from '../support/store';
import { fsSpace } from '../../src/drive/fs-space';
import { NOW, openFsRig, spaceEnvOf, type FsRig } from './fs-rig';

const TOKEN = 'node-token';

let rig: FsRig;
let opened: TestStore;
let ownerId = '';
let node = '';
let api: DriveFsApi;

let opCount = 0;

function op(): string {
  opCount += 1;
  return `op-${String(opCount)}`;
}

function owner(): FsCaller {
  return rig.owner();
}

function member(): FsCaller {
  return rig.member();
}

function pathOf(root: StoredDrive): string {
  return root.path;
}

function seedFolder(root: StoredDrive, relPath: string): Promise<DriveItem> {
  return rig.seedFolder(root, relPath);
}

function seedFile(root: StoredDrive, relPath: string, text: string): Promise<DriveItem> {
  return rig.seedFile(root, relPath, text);
}

async function viewOnlyFolder(): Promise<{ root: StoredDrive; folder: DriveItem }> {
  const root = rig.mine;
  const folder = await seedFolder(root, 'for-sam');
  opened.store.driveGrants.set(
    { itemId: folder.id, profileId: rig.memberId, role: 'view' },
    ownerId,
  );
  rig.mount(rig.memberNode, rig.memberId, root, folder.id);
  return { root, folder };
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
  rig = await openFsRig();
  ({ opened, ownerId, api } = rig);
  node = rig.ownerNode;
});

afterEach(async () => {
  await opened.close();
});

describe('list and stat', () => {
  it('lists a folder by parent id with attributes and etags', async () => {
    const root = rig.shared;
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
    const root = rig.shared;
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
    const root = rig.shared;
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

  it('hides a personal drive from everyone else, the owner included', async () => {
    const root = rig.mine;
    expect(api.list(owner(), root.id, {}).entries).toEqual([]);
    expect((await refusal(() => api.list(member(), root.id, {}))).code).toBe('not_found');
    expect((await refusal(() => api.stat(member(), root.id, { path: '' }))).code).toBe('not_found');
    expect((await refusal(() => api.list(owner(), rig.theirs.id, {}))).code).toBe('not_found');
    expect((await refusal(() => api.stat(owner(), rig.theirs.id, { path: '' }))).code).toBe(
      'not_found',
    );
  });
});

describe('mkdir', () => {
  it('makes a folder at the root and inside a folder, recorded via the mount and the device', async () => {
    const root = rig.shared;
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

  it('refuses a name already taken, a file parent and a folder shared to view only', async () => {
    const root = rig.shared;
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
    const view = await viewOnlyFolder();
    expect(
      (
        await refusal(() =>
          api.mkdir(member(), view.root.id, {
            opId: op(),
            base: view.folder.id,
            parentId: null,
            name: 'x',
          }),
        )
      ).code,
    ).toBe('forbidden');
  });
});

describe('rename', () => {
  it('renames in place, keeping the item and its bytes', async () => {
    const root = rig.shared;
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
    const root = rig.shared;
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

  it('refuses a name taken by a folder, a folder into itself and an item of another drive', async () => {
    const root = rig.shared;
    const other = rig.mine;
    const a = await seedFile(root, 'a.txt', '1');
    const folder = await seedFolder(root, 'f');
    const child = await seedFolder(root, 'f/g');
    const foreign = await seedFile(other, 'z.txt', '3');
    expect(
      (
        await refusal(() =>
          api.rename(owner(), root.id, { opId: op(), itemId: a.id, parentId: null, name: 'f' }),
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
    const root = rig.shared;
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
    const root = rig.shared;
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

  it('refuses a removal in a folder shared to view only', async () => {
    const { root, folder } = await viewOnlyFolder();
    const file = await seedFile(root, 'for-sam/a.txt', 'x');
    const directory = await seedFolder(root, 'for-sam/d');
    const base = folder.id;
    expect(
      (await refusal(() => api.unlink(member(), root.id, { opId: op(), base, itemId: file.id })))
        .code,
    ).toBe('forbidden');
    expect(
      (
        await refusal(() =>
          api.rmdir(member(), root.id, { opId: op(), base, itemId: directory.id }),
        )
      ).code,
    ).toBe('forbidden');
    expect(await exists(join(pathOf(root), 'for-sam', 'a.txt'))).toBe(true);
  });
});

describe('utimens', () => {
  it('sets the modified time on disk and in the index, recorded via the mount', async () => {
    const root = rig.shared;
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
    const root = rig.shared;
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
      space: (caller, rootId, base) => fsSpace(spaceEnvOf(rig), caller, rootId, base),
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
          actorOf: () => ({ profileId: ownerId }),
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
    const root = rig.shared;
    expect((await call(`/drive/fs/${root.id}/list`)).status).toBe(401);
    expect((await call(`/drive/fs/${root.id}/list`, { token: 'wrong' })).status).toBe(401);
  });

  it('lists, stats, makes a folder, renames and removes through the node token', async () => {
    const root = rig.shared;
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
    const root = rig.shared;
    const body = { opId: op(), parentId: null, name: 'once' };
    const first = await call(`/drive/fs/${root.id}/mkdir`, { method: 'POST', token: TOKEN, body });
    const second = await call(`/drive/fs/${root.id}/mkdir`, { method: 'POST', token: TOKEN, body });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(
      opened.store.driveItems.children({
        rootId: root.id,
        parentId: null,
        after: null,
        limit: 10,
        viewer: ownerId,
      }).entries,
    ).toHaveLength(1);
  });

  it('refuses a mutation without an op id', async () => {
    const root = rig.shared;
    const missing = await call(`/drive/fs/${root.id}/mkdir`, {
      method: 'POST',
      token: TOKEN,
      body: { parentId: null, name: 'x' },
    });
    expect(missing.status).toBe(400);
  });

  it('serves a subtree root through the base folder for list, stat and read', async () => {
    const root = rig.shared;
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
    const root = rig.shared;
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
    const root = rig.shared;
    const other = rig.mine;
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
