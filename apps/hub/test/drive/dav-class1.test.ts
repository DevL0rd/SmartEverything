import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  createClientToken,
  hashClientToken,
  type ComputerNodeRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeEnv } from '../../src/drive/changes';
import type { DriveActor } from '../../src/drive/access';
import { nodeFiles } from '../../src/drive/versions';
import { handleMkcol } from '../../src/server/dav/collections';
import type { DavDeps } from '../../src/server/dav/dav-auth';
import { handlePropfind } from '../../src/server/dav/propfind';
import { CLASS1_METHODS, handleRead, sendOptions } from '../../src/server/dav/read';
import { handleDelete, handlePut } from '../../src/server/dav/write';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const OWNER_NODE = `sen_${'a'.repeat(43)}`;
const UNBOUND_NODE = `sen_${'b'.repeat(43)}`;
const UNKNOWN_NODE = `sen_${'c'.repeat(43)}`;
const NODE_IDS: Readonly<Record<string, string>> = {
  [OWNER_NODE]: '0d000000-0000-4000-8000-0000000000a1',
  [UNBOUND_NODE]: '0d000000-0000-4000-8000-0000000000a3',
};
const HANDLERS: Readonly<Record<string, typeof handlePut>> = {
  PROPFIND: handlePropfind,
  GET: handleRead,
  HEAD: handleRead,
  PUT: handlePut,
  MKCOL: handleMkcol,
  DELETE: handleDelete,
};

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

interface Send {
  readonly headers?: Record<string, string>;
  readonly body?: string | readonly string[];
  readonly token?: string | null;
}

let opened: TestStore;
let server: Server;
let port = 0;
let base = '';
let ownerProfile = '';
let memberProfile = '';
let ownerToken = '';
let memberToken = '';
let memberRoot = '';
let otherRoot = '';
let removals = 0;

function nodeRow(deviceId: string): ComputerNodeRow {
  return {
    device_id: deviceId,
    machine_id: '0'.repeat(32),
    hub_url: 'http://hub.local',
    paired_at: NOW.toISOString(),
    revoked_at: null,
  };
}

function depsOf(): DavDeps {
  const { store } = opened;
  const env: ChangeEnv = {
    files: {
      ...nodeFiles,
      remove: async (path): Promise<void> => {
        removals += 1;
        await nodeFiles.remove(path);
      },
    },
    store,
    log: testLogger('drive'),
    now: () => NOW,
    purge: { rearm: (): void => undefined },
  };
  return {
    store,
    env,
    guard: {
      status: (profileId) => store.driveQuotas.status(profileId),
      space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    nodes: {
      authenticate: (token): ComputerNodeRow => {
        const deviceId = token === null ? undefined : NODE_IDS[token];
        if (deviceId === undefined) throw new ApiError('unauthorized', 'unknown node token');
        return nodeRow(deviceId);
      },
      actorOf: (node): DriveActor => {
        if (node.device_id === NODE_IDS[OWNER_NODE]) return { profileId: ownerProfile };
        throw new ApiError('forbidden', 'computer_not_bound_to_person');
      },
    },
  };
}

function send(method: string, path: string, options: Send = {}): Promise<Reply> {
  const token = options.token === undefined ? memberToken : options.token;
  const headers: Record<string, string> = { ...options.headers };
  if (token !== null && headers['authorization'] === undefined) {
    headers['authorization'] = `Bearer ${token}`;
  }
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body });
      });
    });
    outgoing.on('error', reject);
    for (const part of [options.body ?? []].flat()) outgoing.write(part);
    outgoing.end();
  });
}

const url = (rootId: string, path = ''): string => `/dav/${rootId}/${path}`;
const own = (path: string): string => join(opened.layout.person(memberProfile).drive, path);
const put = (path: string, body: string, headers: Record<string, string> = {}): Promise<Reply> =>
  send('PUT', url(memberRoot, path), { body, headers });
const at = (method: string, path: string, headers: Record<string, string> = {}): Promise<Reply> =>
  send(method, url(memberRoot, path), { headers });
const propfind = (path: string, depth: string | null, body = ''): Promise<Reply> =>
  send('PROPFIND', url(memberRoot, path), { headers: depth === null ? {} : { depth }, body });
const missing = { code: 'ENOENT' };

async function startServer(deps: DavDeps): Promise<void> {
  server = createServer((request, response) => {
    const handle = HANDLERS[request.method ?? ''];
    if (handle === undefined) {
      sendOptions(response, '1', CLASS1_METHODS);
      return;
    }
    handle(deps, { request, response }).catch(() => {
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server has no port.');
  port = address.port;
}

async function addDrive(id: string, owner: string | null): Promise<string> {
  const dir = owner === null ? opened.layout.home.drive : opened.layout.person(owner).drive;
  await mkdir(dir, { recursive: true });
  opened.store.driveRoots.insert(
    owner === null ? sharedDriveRoot(id) : personalDriveRoot(id, owner),
  );
  return dir;
}

async function addLockedFolder(rootId: string, dir: string): Promise<void> {
  const id = randomUUID();
  await mkdir(join(dir, 'Locked'));
  putItem(opened.store, { rootId, id, relPath: 'Locked', kind: 'folder' });
  opened.store.driveGrants.set(
    { itemId: id, profileId: memberProfile, role: 'view' },
    ownerProfile,
  );
}

beforeEach(async () => {
  captureLogs();
  removals = 0;
  opened = await driveTestStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  ownerToken = createClientToken();
  memberToken = createClientToken();
  const client = {
    name: 'Phone',
    platform: 'android',
    role: 'member',
    profileId: memberProfile,
  } as const;
  store.clients.create({ ...client, tokenHash: hashClientToken(memberToken) });
  store.clients.create({
    ...client,
    role: 'owner',
    profileId: ownerProfile,
    tokenHash: hashClientToken(ownerToken),
  });
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-dav-')));
  [memberRoot, otherRoot] = [randomUUID(), randomUUID()];
  await addDrive(memberRoot, memberProfile);
  await addLockedFolder(otherRoot, await addDrive(otherRoot, ownerProfile));
  await startServer(depsOf());
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('WebDAV discovery and authentication', () => {
  it('announces class 1 and the class 1 methods without credentials', async () => {
    const reply = await send('OPTIONS', url(memberRoot), { token: null });
    expect(reply.status).toBe(200);
    expect(reply.headers['dav']).toBe('1');
    expect(reply.headers['allow']).toBe(CLASS1_METHODS.join(', '));
  });

  it('challenges a request without a token for a bearer token', async () => {
    const reply = await send('GET', url(memberRoot, 'a.txt'), { token: null });
    expect(reply.status).toBe(401);
    expect(String(reply.headers['www-authenticate'])).toMatch(/^Bearer /u);
  });

  it('refuses Basic credentials even when the password is a valid token', async () => {
    const basic = Buffer.from(`robin:${memberToken}`).toString('base64');
    const headers = { authorization: `Basic ${basic}`, depth: '0' };
    expect((await send('PROPFIND', url(memberRoot), { token: null, headers })).status).toBe(401);
  });

  it('ignores a token in the query string and refuses an unknown token', async () => {
    const query = `${url(memberRoot)}?token=${memberToken}`;
    expect((await send('PROPFIND', query, { token: null, headers: { depth: '0' } })).status).toBe(
      401,
    );
    const unknown = { token: createClientToken(), headers: { depth: '0' } };
    expect((await send('PROPFIND', url(memberRoot), unknown)).status).toBe(401);
  });

  it('accepts the owner computer token and refuses one bound to nobody or unknown', async () => {
    const statusOf = async (token: string): Promise<number> =>
      (await send('PROPFIND', url(otherRoot), { token, headers: { depth: '0' } })).status;
    expect(await statusOf(OWNER_NODE)).toBe(207);
    expect(await statusOf(UNBOUND_NODE)).toBe(403);
    expect(await statusOf(UNKNOWN_NODE)).toBe(401);
  });

  it('hides a personal drive from every other person, the owner included', async () => {
    const headers = { depth: '0' };
    expect((await send('PROPFIND', url(otherRoot), { headers })).status).toBe(404);
    expect((await send('PROPFIND', url(otherRoot), { headers, token: ownerToken })).status).toBe(
      207,
    );
    expect((await send('PROPFIND', url(memberRoot), { headers, token: ownerToken })).status).toBe(
      404,
    );
  });

  it('lets a view grant read the shared folder and nothing above it', async () => {
    const headers = { depth: '1' };
    expect((await send('PROPFIND', url(otherRoot, 'Locked'), { headers })).status).toBe(207);
    expect((await send('PROPFIND', url(otherRoot), { headers })).status).toBe(404);
  });
});

describe('WebDAV reads and writes', () => {
  it('creates a file, serves it, and replaces it keeping the old bytes', async () => {
    const created = await put('note.txt', 'first');
    expect(created.status).toBe(201);
    expect(created.headers['etag']).toMatch(/^"1-/u);
    const read = await at('GET', 'note.txt');
    expect([read.status, read.body, read.headers['content-type']]).toEqual([
      200,
      'first',
      'text/plain',
    ]);
    expect((await put('note.txt', 'second')).status).toBe(204);
    expect(await readFile(own('note.txt'), 'utf8')).toBe('second');
    const item = opened.store.driveItems.byPath(memberRoot, 'note.txt', null);
    expect(item?.rev).toBe(2);
    expect(opened.store.driveVersions.forItem(item?.id ?? '', null, 10).versions).toHaveLength(1);
  });

  it('records one feed row per write, via mount, with the device id', async () => {
    await put('note.txt', 'first');
    const rows = opened.store.driveFeed.since(0, 10).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ op: 'create', via: 'mount', actorProfileId: memberProfile });
    expect(rows[0]?.deviceId).not.toBeNull();
  });

  it('answers ranges, HEAD and a matching entity tag', async () => {
    await put('fox.txt', 'the quick brown fox');
    const range = await at('GET', 'fox.txt', { range: 'bytes=4-8' });
    expect([range.status, range.body]).toEqual([206, 'quick']);
    const head = await at('HEAD', 'fox.txt');
    expect([head.status, head.headers['content-length'], head.body]).toEqual([200, '19', '']);
    const etag = String(head.headers['etag']);
    expect((await at('GET', 'fox.txt', { 'if-none-match': etag })).status).toBe(304);
  });

  it('refuses a file on a collection, a missing parent and a read of a collection or a gap', async () => {
    await at('MKCOL', 'docs');
    expect((await put('docs', 'x')).status).toBe(405);
    expect((await put('nope/a.txt', 'x')).status).toBe(409);
    expect((await at('GET', 'docs')).status).toBe(405);
    expect((await at('GET', 'gone.txt')).status).toBe(404);
  });

  it('honours If-Match and If-None-Match on PUT', async () => {
    await put('a.txt', 'one');
    expect((await put('a.txt', 'two', { 'if-none-match': '*' })).status).toBe(412);
    expect((await put('a.txt', 'two', { 'if-match': '"0-stale"' })).status).toBe(412);
    expect(await readFile(own('a.txt'), 'utf8')).toBe('one');
  });

  it('refuses writes under a view grant and a partial PUT', async () => {
    const locked = await send('PUT', url(otherRoot, 'Locked/a.txt'), { body: 'x' });
    expect(locked.status).toBe(403);
    expect(await readdir(join(opened.layout.person(ownerProfile).drive, 'Locked'))).toEqual([]);
    expect((await put('a.txt', 'x', { 'content-range': 'bytes 0-0/1' })).status).toBe(400);
  });
});

describe('WebDAV collections and deletion', () => {
  it('makes a collection once, records it, and refuses a body or a missing parent', async () => {
    expect((await at('MKCOL', 'docs')).status).toBe(201);
    expect((await at('MKCOL', 'docs')).status).toBe(405);
    expect((await at('MKCOL', 'a/b')).status).toBe(409);
    const withBody = await send('MKCOL', url(memberRoot, 'x'), { body: '<x/>' });
    expect(withBody.status).toBe(415);
    expect((await stat(own('docs'))).isDirectory()).toBe(true);
    expect(opened.store.driveFeed.since(0, 10).rows[0]).toMatchObject({
      op: 'create',
      via: 'mount',
    });
  });

  it('moves a deleted file and a deleted collection to the trash', async () => {
    await at('MKCOL', 'docs');
    await put('docs/a.txt', 'a');
    await put('b.txt', 'b');
    const file = opened.store.driveItems.byPath(memberRoot, 'b.txt', null);
    expect((await at('DELETE', 'b.txt')).status).toBe(204);
    expect(opened.store.driveTrash.find(file?.id ?? '')).toBeDefined();
    expect((await at('GET', 'b.txt')).status).toBe(404);
    expect((await at('DELETE', 'docs')).status).toBe(204);
    expect(opened.store.driveItems.byPath(memberRoot, 'docs/a.txt', null)).toBeUndefined();
    expect((await at('DELETE', 'docs')).status).toBe(404);
    expect((await at('DELETE', '')).status).toBe(403);
  });

  it('deletes only when If-Match names the current entity tag', async () => {
    await put('a.txt', 'one');
    expect((await at('DELETE', 'a.txt', { 'if-match': '"0-stale"' })).status).toBe(412);
    expect(opened.store.driveItems.byPath(memberRoot, 'a.txt', null)).toBeDefined();
  });
});

describe('WebDAV PROPFIND', () => {
  beforeEach(async () => {
    await at('MKCOL', 'docs');
    await put('docs/a%20b.txt', 'hello');
    await put('top.txt', 'top');
  });

  it('lists the folder itself and its children at depth 1', async () => {
    const reply = await propfind('', '1');
    expect(reply.status).toBe(207);
    expect(reply.headers['content-type']).toContain('application/xml');
    for (const href of ['', 'docs/', 'top.txt']) {
      expect(reply.body).toContain(`<D:href>/dav/${memberRoot}/${href}</D:href>`);
    }
    expect(reply.body).not.toContain('a%20b.txt');
    expect(reply.body).toContain('<D:getcontentlength>3</D:getcontentlength>');
    expect(reply.body).toContain('<D:resourcetype><D:collection/></D:resourcetype>');
  });

  it('lists only the target at depth 0 and percent-encodes names', async () => {
    expect((await propfind('docs', '0')).body.match(/<D:response>/gu)).toHaveLength(1);
    expect((await propfind('docs', '1')).body).toContain('docs/a%20b.txt</D:href>');
  });

  it('refuses infinite depth and a missing Depth header', async () => {
    for (const depth of ['infinity', null]) {
      const reply = await propfind('', depth);
      expect(reply.status).toBe(403);
      expect(reply.body).toContain('propfind-finite-depth');
    }
  });

  it('answers a named property list with a 404 propstat for unknown names', async () => {
    const body =
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:x="urn:x"><d:prop><d:getetag/><x:colour/></d:prop></d:propfind>';
    const reply = await propfind('top.txt', '0', body);
    expect(reply.status).toBe(207);
    expect(reply.body).toContain('<D:getetag>&quot;1-');
    expect(reply.body).toContain('<n0:colour xmlns:n0="urn:x"/>');
    expect(reply.body).toContain('404 Not Found');
    expect(reply.body).not.toContain('getcontentlength');
  });

  it('answers propname with names only and never a property inherited from Object', async () => {
    const names = await propfind('top.txt', '0', '<propfind xmlns="DAV:"><propname/></propfind>');
    expect(names.body).toContain('<D:getetag/>');
    expect(names.body).not.toContain('<D:getetag>');
    const body = '<propfind xmlns="DAV:"><prop><toString/></prop></propfind>';
    expect((await propfind('top.txt', '0', body)).body).toContain('404 Not Found');
  });

  it('refuses a body that is not a propfind or not well-formed, and a missing path', async () => {
    expect((await propfind('', '0', '<other xmlns="DAV:"/>')).status).toBe(400);
    expect((await propfind('', '0', '<propfind xmlns="DAV:"><prop>')).status).toBe(400);
    expect((await propfind('missing', '0')).status).toBe(404);
  });
});

describe('WebDAV path safety', () => {
  const dots = ['%2e%2e/x.txt', '%2E%2E/x.txt', '../x.txt', 'a/%2e%2e/%2e%2e/x.txt', './x.txt'];

  it('refuses encoded and plain dot segments in every method', async () => {
    for (const path of dots) {
      for (const method of ['GET', 'MKCOL', 'DELETE']) {
        expect((await at(method, path)).status).toBe(400);
      }
      expect((await put(path, 'x')).status).toBe(400);
      expect((await propfind(path, '0')).status).toBe(400);
    }
    await expect(
      stat(join(opened.layout.person(memberProfile).drive, '..', 'x.txt')),
    ).rejects.toMatchObject(missing);
    await expect(stat(own('x.txt'))).rejects.toMatchObject(missing);
  });

  it('refuses an encoded slash inside a name, empty segments and bad encoding', async () => {
    for (const path of ['a%2fb.txt', 'a%2Fb.txt', 'a//b.txt', 'bad%zz.txt', 'nul%00.txt']) {
      expect((await put(path, 'x')).status).toBe(400);
    }
    expect(await readdir(own(''))).not.toContain('a');
  });

  it('decodes once: a doubly encoded dot name is an ordinary file name', async () => {
    expect((await put('%252e%252e', 'x')).status).toBe(201);
    expect(await readFile(own('%2e%2e'), 'utf8')).toBe('x');
    expect(opened.store.driveItems.byPath(memberRoot, '%2e%2e', null)).toBeDefined();
  });

  it('stores and finds a decomposed name in its composed form', async () => {
    const decomposed = encodeURIComponent('café.txt');
    expect((await put(decomposed, 'x')).status).toBe(201);
    expect(opened.store.driveItems.byPath(memberRoot, 'café.txt', null)).toBeDefined();
    expect((await at('GET', encodeURIComponent('café.txt'))).body).toBe('x');
    expect((await at('GET', decomposed)).body).toBe('x');
  });

  it('keeps the hub private folder out of reach, in every spelling', async () => {
    await writeFile(own('.smarteverything-note'), 'ok');
    for (const path of [
      '.smarteverything',
      '.smarteverything/root.json',
      '%2esmarteverything/tmp/x',
    ]) {
      for (const method of ['GET', 'MKCOL', 'DELETE']) {
        expect((await at(method, path)).status).toBe(403);
      }
      expect((await put(path, 'x')).status).toBe(403);
      expect((await propfind(path, '0')).status).toBe(403);
    }
    expect((await at('GET', '.smarteverything-note')).status).toBe(404);
  });
});

describe('WebDAV quota', () => {
  beforeEach(() => {
    opened.store.driveQuotas.set(memberProfile, 10);
  });

  it('refuses a declared length over the quota before storing anything', async () => {
    const reply = await put('big.txt', 'x'.repeat(11), { 'content-length': '11' });
    expect(reply.status).toBe(507);
    expect(opened.store.driveItems.byPath(memberRoot, 'big.txt', null)).toBeUndefined();
    await expect(stat(own('big.txt'))).rejects.toMatchObject(missing);
  });

  it('stops a streamed upload of unknown length at the quota and removes the partial file', async () => {
    const reply = await send('PUT', url(memberRoot, 'stream.txt'), {
      body: ['12345', '67890', '1'],
    });
    expect(reply.status).toBe(507);
    expect(opened.store.driveItems.byPath(memberRoot, 'stream.txt', null)).toBeUndefined();
    await expect(stat(own('stream.txt'))).rejects.toMatchObject(missing);
    expect(await readdir(own('.smarteverything/tmp'))).toEqual([]);
    expect(removals).toBeGreaterThan(0);
  });

  it('accepts an upload that fits and counts a replacement against the old size', async () => {
    expect((await put('fit.txt', '1234567890')).status).toBe(201);
    expect((await put('fit.txt', 'abcdefghij')).status).toBe(204);
    expect(await readFile(own('fit.txt'), 'utf8')).toBe('abcdefghij');
  });
});
