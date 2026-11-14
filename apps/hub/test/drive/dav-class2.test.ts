import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClientToken, hashClientToken } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeEnv } from '../../src/drive/changes';
import { Readable } from 'node:stream';
import { commitContent } from '../../src/drive/changes';
import { DriveReadService } from '../../src/drive/service-read';
import { nodeFiles, stageBytes } from '../../src/drive/versions';
import type { DavDeps } from '../../src/server/dav/dav-auth';
import { CLASS2_METHODS, createDavHandler, parseIf } from '../../src/server/dav/index';
import { SERVER_LOCK_SECONDS } from '../../src/server/dav/locks';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const START = new Date('2026-11-07T00:00:00.000Z');
const LOCK_BODY =
  '<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope>' +
  '<D:locktype><D:write/></D:locktype><D:owner><D:href>mailto:robin@example.com</D:href></D:owner></D:lockinfo>';
const SHARED_BODY = LOCK_BODY.replace('exclusive', 'shared');

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

interface Send {
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly token?: string | null;
}

let opened: TestStore;
let server: Server;
let port = 0;
let base = '';
let clock = START;
let memberProfile = '';
let ownerProfile = '';
let memberToken = '';
let ownerToken = '';
let memberRoot = '';
let otherRoot = '';
let lockedRoot = '';

function depsOf(): DavDeps {
  const { store } = opened;
  const env: ChangeEnv = {
    files: nodeFiles,
    store,
    log: testLogger('drive'),
    now: () => clock,
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
      authenticate: (): never => {
        throw new Error('no computer tokens in this test');
      },
      actorOf: (): never => {
        throw new Error('no computer tokens in this test');
      },
    },
  };
}

function send(method: string, path: string, options: Send = {}): Promise<Reply> {
  const token = options.token === undefined ? memberToken : options.token;
  const headers: Record<string, string> = { ...options.headers };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
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
    outgoing.end(options.body);
  });
}

const url = (rootId: string, path = ''): string => `/dav/${rootId}/${path}`;
const own = (path: string): string => join(opened.layout.person(memberProfile).drive, path);
const at = (method: string, path: string, headers: Record<string, string> = {}): Promise<Reply> =>
  send(method, url(memberRoot, path), { headers });
const put = (path: string, body: string, headers: Record<string, string> = {}): Promise<Reply> =>
  send('PUT', url(memberRoot, path), { body, headers });
const destination = (path: string, rootId = memberRoot): Record<string, string> => ({
  destination: `http://127.0.0.1:${String(port)}${url(rootId, path)}`,
});
const copy = (from: string, to: string, headers: Record<string, string> = {}): Promise<Reply> =>
  at('COPY', from, { ...destination(to), ...headers });
const move = (from: string, to: string, headers: Record<string, string> = {}): Promise<Reply> =>
  at('MOVE', from, { ...destination(to), ...headers });
const lock = (
  path: string,
  headers: Record<string, string> = {},
  body = LOCK_BODY,
  token?: string | null,
): Promise<Reply> =>
  send(
    'LOCK',
    url(memberRoot, path),
    token === undefined ? { headers, body } : { headers, body, token },
  );
const tokenOf = (reply: Reply): string =>
  String(reply.headers['lock-token']).replace(/^<|>$/gu, '');
const holding = (token: string, path: string | null = null): Record<string, string> => ({
  if: `${path === null ? '' : `<${url(memberRoot, path)}> `}(<${token}>)`,
});
function writableRoot(): ReturnType<DriveReadService['rootFor']> {
  return new DriveReadService(opened.store).rootFor({ profileId: memberProfile }, memberRoot);
}
const exists = (path: string): Promise<boolean> =>
  stat(own(path)).then(
    () => true,
    () => false,
  );

async function startServer(deps: DavDeps): Promise<void> {
  const handle = createDavHandler(deps);
  server = createServer((request, response) => {
    handle({ request, response }).catch(() => {
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
  clock = START;
  opened = await driveTestStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  memberToken = createClientToken();
  ownerToken = createClientToken();
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
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-dav2-')));
  [memberRoot, otherRoot, lockedRoot] = [randomUUID(), randomUUID(), randomUUID()];
  await addDrive(memberRoot, memberProfile);
  await addDrive(otherRoot, null);
  await addLockedFolder(lockedRoot, await addDrive(lockedRoot, ownerProfile));
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

describe('WebDAV class 2 discovery', () => {
  it('announces class 2 and every class 2 method without credentials', async () => {
    const reply = await send('OPTIONS', url(memberRoot), { token: null });
    expect(reply.status).toBe(200);
    expect(reply.headers['dav']).toBe('1, 2');
    expect(reply.headers['allow']).toBe(CLASS2_METHODS.join(', '));
    expect(CLASS2_METHODS).toEqual(expect.arrayContaining(['COPY', 'MOVE', 'LOCK', 'UNLOCK']));
  });

  it('answers an unknown method with 405 and the allowed methods', async () => {
    const reply = await at('PROPPATCH', 'a.txt');
    expect(reply.status).toBe(405);
    expect(reply.headers['allow']).toBe(CLASS2_METHODS.join(', '));
  });

  it('refuses COPY, MOVE, LOCK and UNLOCK without a token', async () => {
    for (const method of ['COPY', 'MOVE', 'LOCK', 'UNLOCK']) {
      const reply = await send(method, url(memberRoot, 'a.txt'), {
        token: null,
        headers: destination('b.txt'),
      });
      expect(reply.status).toBe(401);
    }
  });
});

describe('COPY', () => {
  it('copies a file, keeps the source and indexes the copy', async () => {
    await put('a.txt', 'hello');
    const reply = await copy('a.txt', 'b.txt');
    expect(reply.status).toBe(201);
    expect(await readFile(own('a.txt'), 'utf8')).toBe('hello');
    expect(await readFile(own('b.txt'), 'utf8')).toBe('hello');
    const got = await at('GET', 'b.txt');
    expect(got.body).toBe('hello');
    expect(opened.store.driveItems.byPath(memberRoot, 'b.txt', null)?.bytes).toBe(5);
  });

  it('replaces an existing destination with 204 and refuses it when Overwrite is F', async () => {
    await put('a.txt', 'new');
    await put('b.txt', 'old');
    expect((await copy('a.txt', 'b.txt', { overwrite: 'F' })).status).toBe(412);
    expect(await readFile(own('b.txt'), 'utf8')).toBe('old');
    expect((await copy('a.txt', 'b.txt', { overwrite: 'T' })).status).toBe(204);
    expect(await readFile(own('b.txt'), 'utf8')).toBe('new');
  });

  it('copies a collection with everything inside it', async () => {
    await at('MKCOL', 'dir');
    await at('MKCOL', 'dir/sub');
    await put('dir/one.txt', '1');
    await put('dir/sub/two.txt', '22');
    expect((await copy('dir', 'clone')).status).toBe(201);
    expect(await readFile(own('clone/one.txt'), 'utf8')).toBe('1');
    expect(await readFile(own('clone/sub/two.txt'), 'utf8')).toBe('22');
    expect(await exists('dir/sub/two.txt')).toBe(true);
    expect(opened.store.driveItems.byPath(memberRoot, 'clone/sub/two.txt', null)?.bytes).toBe(2);
  });

  it('copies only the collection itself with Depth 0', async () => {
    await at('MKCOL', 'dir');
    await put('dir/one.txt', '1');
    expect((await copy('dir', 'shallow', { depth: '0' })).status).toBe(201);
    expect(await exists('shallow')).toBe(true);
    expect(await exists('shallow/one.txt')).toBe(false);
  });

  it('refuses an invalid Depth and an invalid Overwrite', async () => {
    await put('a.txt', 'x');
    expect((await copy('a.txt', 'b.txt', { depth: '1' })).status).toBe(400);
    expect((await copy('a.txt', 'b.txt', { overwrite: 'maybe' })).status).toBe(400);
  });

  it('answers 404 for a missing source and 409 for a missing destination parent', async () => {
    expect((await copy('nothing.txt', 'b.txt')).status).toBe(404);
    await put('a.txt', 'x');
    expect((await copy('a.txt', 'gone/b.txt')).status).toBe(409);
  });

  it('refuses a collection copied into itself', async () => {
    await at('MKCOL', 'dir');
    expect((await copy('dir', 'dir/inside')).status).toBe(403);
    expect((await copy('dir', 'dir')).status).toBe(403);
  });

  it('counts the copy against the quota like any other write', async () => {
    await put('a.txt', 'x');
    opened.store.driveQuotas.set(memberProfile, 1);
    expect((await copy('a.txt', 'b.txt')).status).toBe(507);
    expect(await exists('b.txt')).toBe(false);
  });
});

describe('MOVE', () => {
  it('renames a file and removes the source', async () => {
    await put('a.txt', 'hello');
    expect((await move('a.txt', 'b.txt')).status).toBe(201);
    expect(await exists('a.txt')).toBe(false);
    expect(await readFile(own('b.txt'), 'utf8')).toBe('hello');
    expect((await at('GET', 'a.txt')).status).toBe(404);
    expect((await at('GET', 'b.txt')).body).toBe('hello');
  });

  it('moves a collection and every child path follows it', async () => {
    await at('MKCOL', 'dir');
    await put('dir/one.txt', '1');
    expect((await move('dir', 'renamed')).status).toBe(201);
    expect(await exists('dir')).toBe(false);
    expect((await at('GET', 'renamed/one.txt')).body).toBe('1');
    expect(opened.store.driveItems.byPath(memberRoot, 'dir/one.txt', null)).toBeUndefined();
  });

  it('moves a file into another collection and replaces an existing destination', async () => {
    await at('MKCOL', 'dir');
    await put('a.txt', 'new');
    await put('dir/a.txt', 'old');
    expect((await move('a.txt', 'dir/a.txt', { overwrite: 'F' })).status).toBe(412);
    expect((await move('a.txt', 'dir/a.txt')).status).toBe(204);
    expect(await readFile(own('dir/a.txt'), 'utf8')).toBe('new');
  });

  it('refuses a Depth other than infinity', async () => {
    await put('a.txt', 'x');
    expect((await move('a.txt', 'b.txt', { depth: '0' })).status).toBe(400);
  });

  it('refuses the top folder of a library folder', async () => {
    expect((await move('', 'b')).status).toBe(403);
  });
});

describe('Destination handling', () => {
  beforeEach(async () => {
    await put('a.txt', 'x');
  });

  it('accepts a path without a host and a URL with the same host', async () => {
    const path = url(memberRoot, 'p.txt');
    expect((await at('COPY', 'a.txt', { destination: path })).status).toBe(201);
    expect((await copy('a.txt', 'q.txt')).status).toBe(201);
  });

  it('refuses another host with 502', async () => {
    const headers = { destination: `http://evil.example${url(memberRoot, 'b.txt')}` };
    expect((await at('COPY', 'a.txt', headers)).status).toBe(502);
    expect(await exists('b.txt')).toBe(false);
  });

  it('refuses credentials in the authority', async () => {
    const headers = {
      destination: `http://u:p@127.0.0.1:${String(port)}${url(memberRoot, 'b.txt')}`,
    };
    expect((await at('COPY', 'a.txt', headers)).status).toBe(400);
  });

  it('refuses another root, including one the person can read', async () => {
    expect((await copy('a.txt', 'b.txt', destination('b.txt', otherRoot))).status).toBe(403);
    expect((await move('a.txt', 'b.txt', destination('b.txt', otherRoot))).status).toBe(403);
    expect(await exists('a.txt')).toBe(true);
  });

  it('refuses a destination outside the WebDAV tree', async () => {
    const headers = { destination: `http://127.0.0.1:${String(port)}/drive/fs/b.txt` };
    expect((await at('COPY', 'a.txt', headers)).status).toBe(502);
  });

  it('refuses a missing Destination header', async () => {
    expect((await at('COPY', 'a.txt')).status).toBe(400);
  });

  it('refuses an encoded parent segment and an encoded slash', async () => {
    const parent = { destination: `${url(memberRoot)}%2e%2e/escape.txt` };
    expect([400, 403]).toContain((await at('COPY', 'a.txt', parent)).status);
    const slash = { destination: `${url(memberRoot)}x%2fy.txt` };
    expect((await at('COPY', 'a.txt', slash)).status).toBe(400);
    expect(await exists('../escape.txt')).toBe(false);
    expect(await exists('x/y.txt')).toBe(false);
  });

  it('refuses the hub marker folder as a destination', async () => {
    const headers = { destination: url(memberRoot, '.smarteverything/x') };
    expect((await at('COPY', 'a.txt', headers)).status).toBe(403);
  });

  it('refuses a copy into a read-only root', async () => {
    const reply = await at('COPY', 'a.txt', destination('Locked/b.txt', lockedRoot));
    expect(reply.status).toBe(403);
  });
});

describe('LOCK and UNLOCK', () => {
  it('locks an existing file and answers the token in a header and in the body', async () => {
    await put('a.txt', 'x');
    const reply = await lock('a.txt', { timeout: 'Second-120' });
    expect(reply.status).toBe(200);
    expect(tokenOf(reply)).toMatch(/^opaquelocktoken:/u);
    expect(reply.body).toContain(tokenOf(reply));
    expect(reply.body).toContain('<D:exclusive/>');
    expect(reply.body).toContain('Second-120');
    expect(reply.body).toContain('mailto:robin@example.com');
  });

  it('honours the timeout the client asks for', async () => {
    await put('a.txt', 'x');
    expect((await lock('a.txt', { timeout: 'Second-30' })).body).toContain('Second-30');
  });

  it('gives an Infinite request the timeout the server chose, so a crashed client frees the file', async () => {
    await put('a.txt', 'x');
    const reply = await lock('a.txt', { timeout: 'Infinite, Second-4100000000' });
    expect(reply.body).toContain(`Second-${String(SERVER_LOCK_SECONDS)}`);
    expect(reply.body).not.toMatch(/infinite/iu);
    clock = new Date(START.getTime() + (SERVER_LOCK_SECONDS + 1) * 1000);
    expect((await put('a.txt', 'free')).status).toBe(204);
  });

  it('gives a request without a timeout the server timeout', async () => {
    await put('a.txt', 'x');
    expect((await lock('a.txt')).body).toContain(`Second-${String(SERVER_LOCK_SECONDS)}`);
  });

  it('creates an empty file when the address is unmapped', async () => {
    const reply = await lock('fresh.txt');
    expect(reply.status).toBe(201);
    expect((await stat(own('fresh.txt'))).size).toBe(0);
    expect((await put('fresh.txt', 'data')).status).toBe(423);
    expect((await put('fresh.txt', 'data', holding(tokenOf(reply)))).status).toBe(204);
  });

  it('refuses a second exclusive lock and allows two shared locks', async () => {
    await put('a.txt', 'x');
    expect((await lock('a.txt')).status).toBe(200);
    const refused = await lock('a.txt');
    expect(refused.status).toBe(423);
    expect(refused.body).toContain('no-conflicting-lock');
    await put('s.txt', 'x');
    expect((await lock('s.txt', {}, SHARED_BODY)).status).toBe(200);
    expect((await lock('s.txt', {}, SHARED_BODY)).status).toBe(200);
    expect((await lock('s.txt')).status).toBe(423);
  });

  it('refuses a body that is not a write lock request', async () => {
    await put('a.txt', 'x');
    expect((await lock('a.txt', {}, '<nonsense/>')).status).toBe(400);
    expect((await lock('a.txt', { depth: '1' })).status).toBe(400);
  });

  it('refreshes a lock with an empty body and the token in If', async () => {
    await put('a.txt', 'x');
    const token = tokenOf(await lock('a.txt', { timeout: 'Second-60' }));
    clock = new Date(START.getTime() + 50_000);
    const refreshed = await lock('a.txt', { ...holding(token), timeout: 'Second-60' }, '');
    expect(refreshed.status).toBe(200);
    clock = new Date(START.getTime() + 100_000);
    expect((await put('a.txt', 'y')).status).toBe(423);
    expect((await lock('a.txt', {}, '')).status).toBe(412);
  });

  it('releases a lock with UNLOCK and lets everyone write again', async () => {
    await put('a.txt', 'x');
    const token = tokenOf(await lock('a.txt'));
    expect((await put('a.txt', 'y')).status).toBe(423);
    const released = await at('UNLOCK', 'a.txt', { 'lock-token': `<${token}>` });
    expect(released.status).toBe(204);
    expect((await put('a.txt', 'y')).status).toBe(204);
  });

  it('refuses UNLOCK without a token, with a wrong token and by another person', async () => {
    await put('a.txt', 'x');
    const token = tokenOf(await lock('a.txt'));
    expect((await at('UNLOCK', 'a.txt')).status).toBe(400);
    const wrong = await at('UNLOCK', 'a.txt', { 'lock-token': '<opaquelocktoken:nope>' });
    expect(wrong.status).toBe(409);
    const other = await send('UNLOCK', url(memberRoot, 'a.txt'), {
      token: ownerToken,
      headers: { 'lock-token': `<${token}>` },
    });
    expect([403, 404]).toContain(other.status);
    expect((await put('a.txt', 'y')).status).toBe(423);
  });

  it('expires a lock when its time has passed', async () => {
    await put('a.txt', 'x');
    await lock('a.txt', { timeout: 'Second-10' });
    expect((await put('a.txt', 'y')).status).toBe(423);
    clock = new Date(START.getTime() + 11_000);
    expect((await put('a.txt', 'y')).status).toBe(204);
  });
});

describe('locks protect writes of DAV clients', () => {
  it('requires the token for PUT, DELETE, MOVE and COPY onto a locked file', async () => {
    await put('a.txt', 'x');
    await put('other.txt', 'o');
    const token = tokenOf(await lock('a.txt'));
    expect((await put('a.txt', 'y')).status).toBe(423);
    expect((await at('DELETE', 'a.txt')).status).toBe(423);
    expect((await move('a.txt', 'z.txt')).status).toBe(423);
    expect((await copy('other.txt', 'a.txt')).status).toBe(423);
    expect((await move('other.txt', 'a.txt')).status).toBe(423);
    expect(await readFile(own('a.txt'), 'utf8')).toBe('x');
    expect((await put('a.txt', 'y', holding(token))).status).toBe(204);
  });

  it('allows reading and listing a locked file', async () => {
    await put('a.txt', 'x');
    await lock('a.txt');
    expect((await at('GET', 'a.txt')).body).toBe('x');
    expect((await at('PROPFIND', 'a.txt', { depth: '0' })).status).toBe(207);
  });

  it('refuses another person who submits the token', async () => {
    await put('a.txt', 'x');
    const token = tokenOf(await lock('a.txt'));
    const reply = await send('PUT', url(memberRoot, 'a.txt'), {
      token: ownerToken,
      body: 'y',
      headers: holding(token),
    });
    expect([403, 404, 423]).toContain(reply.status);
    expect(await readFile(own('a.txt'), 'utf8')).toBe('x');
  });

  it('lets a depth infinity lock on a collection cover what is inside and new members', async () => {
    await at('MKCOL', 'dir');
    await put('dir/one.txt', '1');
    const token = tokenOf(await lock('dir/', { depth: 'infinity' }));
    expect((await put('dir/one.txt', 'x')).status).toBe(423);
    expect((await put('dir/new.txt', 'x')).status).toBe(423);
    expect((await at('MKCOL', 'dir/sub')).status).toBe(423);
    expect((await at('DELETE', 'dir/one.txt')).status).toBe(423);
    expect((await put('dir/new.txt', 'x', holding(token, 'dir/'))).status).toBe(201);
  });

  it('lets a depth 0 lock on a collection block its members list but not their content', async () => {
    await at('MKCOL', 'dir');
    await put('dir/one.txt', '1');
    const token = tokenOf(await lock('dir/', { depth: '0' }));
    expect((await put('dir/one.txt', 'x')).status).toBe(204);
    expect((await put('dir/new.txt', 'x')).status).toBe(423);
    expect((await put('dir/new.txt', 'x', holding(token, 'dir/'))).status).toBe(201);
  });

  it('refuses deleting or moving a collection that holds a locked file', async () => {
    await at('MKCOL', 'dir');
    await put('dir/one.txt', '1');
    const token = tokenOf(await lock('dir/one.txt'));
    expect((await at('DELETE', 'dir')).status).toBe(423);
    expect((await move('dir', 'gone')).status).toBe(423);
    expect((await at('DELETE', 'dir', holding(token, 'dir/one.txt'))).status).toBe(204);
  });

  it('drops the locks of a resource that was deleted or moved away', async () => {
    await put('a.txt', 'x');
    const token = tokenOf(await lock('a.txt'));
    expect((await move('a.txt', 'b.txt', holding(token))).status).toBe(201);
    expect((await put('a.txt', 'again')).status).toBe(201);
    expect((await at('UNLOCK', 'a.txt', { 'lock-token': `<${token}>` })).status).toBe(409);
    expect((await put('b.txt', 'free')).status).toBe(204);
  });

  it('does not protect a file from a write that never goes through DAV', async () => {
    await put('a.txt', 'x');
    await lock('a.txt');
    const root = writableRoot();
    const staged = await stageBytes(depsOf().env, root, Readable.from([Buffer.from('direct')]));
    const actor = { actorProfileId: memberProfile, via: 'app', deviceId: null } as const;
    await commitContent(depsOf().env, { root, staged, relPath: 'a.txt', actor });
    expect(await readFile(own('a.txt'), 'utf8')).toBe('direct');
  });
});

describe('If header', () => {
  it('parses tagged and untagged lists with tokens, entity tags and Not', () => {
    const lists = parseIf('</dav/r/a> (<opaquelocktoken:1> ["abc"]) (Not <DAV:no-lock>) (<x>)');
    expect(lists).toHaveLength(3);
    expect(lists[0]?.href).toBe('/dav/r/a');
    expect(lists[0]?.conditions).toEqual([
      { negated: false, token: 'opaquelocktoken:1', etag: null },
      { negated: false, token: null, etag: '"abc"' },
    ]);
    expect(lists[1]?.conditions[0]?.negated).toBe(true);
  });

  it('refuses a malformed If header', async () => {
    await put('a.txt', 'x');
    for (const header of ['garbage', '(', '()', '(<a>', '<a>']) {
      expect((await put('a.txt', 'y', { if: header })).status).toBe(400);
    }
  });

  it('answers 412 when no list holds and applies the write when one does', async () => {
    await put('a.txt', 'x');
    const etag = opened.store.driveItems.byPath(memberRoot, 'a.txt', null)?.etag ?? '';
    expect((await put('a.txt', 'y', { if: '(["stale"])' })).status).toBe(412);
    expect((await put('a.txt', 'y', { if: `(["${etag}"])` })).status).toBe(204);
    expect((await put('a.txt', 'z', { if: '(Not <DAV:no-lock>)' })).status).toBe(204);
    expect(await readFile(own('a.txt'), 'utf8')).toBe('z');
  });

  it('answers 412 for a token that is not a lock on the resource', async () => {
    await put('a.txt', 'x');
    const reply = await put('a.txt', 'y', { if: '(<opaquelocktoken:unknown>)' });
    expect(reply.status).toBe(412);
  });

  it('evaluates a tagged list against the resource it names', async () => {
    await put('a.txt', 'x');
    await put('b.txt', 'b');
    const token = tokenOf(await lock('b.txt'));
    const tagged = { if: `<${url(memberRoot, 'b.txt')}> (<${token}>)` };
    expect((await copy('a.txt', 'b.txt', tagged)).status).toBe(204);
    expect(await readFile(own('b.txt'), 'utf8')).toBe('x');
  });

  it('lets a lock on the destination be satisfied through the If header of a MOVE', async () => {
    await put('a.txt', 'x');
    await put('b.txt', 'b');
    const token = tokenOf(await lock('b.txt'));
    expect((await move('a.txt', 'b.txt')).status).toBe(423);
    expect((await move('a.txt', 'b.txt', holding(token, 'b.txt'))).status).toBe(204);
  });
});
