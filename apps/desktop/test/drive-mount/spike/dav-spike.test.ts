import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const HUB_PREFIX = '/dav/root1/';
const HUB_ROOT = '/dav/root1';
const HUB_TOKEN = 'device-token-for-test';
interface DavNode {
  readonly dir: boolean;
  readonly data: Buffer;
}

interface Hub {
  readonly nodes: Map<string, DavNode>;
  readonly locks: Map<string, string>;
}

type Req = IncomingMessage;
type Res = ServerResponse;
type Handler = (hub: Hub, req: Req, res: Res, path: string) => boolean | Promise<boolean>;

const send = (res: Res, status: number, headers = {}, body = ''): boolean => {
  res.writeHead(status, { 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
  return true;
};

const readBody = async (req: Req): Promise<Buffer> =>
  Buffer.from(await new Response(Readable.toWeb(req)).arrayBuffer());

const listen = async (server: Server): Promise<number> => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('not a TCP server');
  return address.port;
};

const close = async (...servers: readonly Server[]): Promise<void> => {
  await Promise.all(servers.map((server) => promisify(server.close.bind(server))()));
};

const fresh = (dir: boolean, data: Buffer = Buffer.alloc(0)): DavNode => ({ dir, data });

const entry = (href: string, node: DavNode): string => {
  const shown = node.dir ? `${href}/` : href;
  const type = node.dir ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>';
  const length = node.dir
    ? ''
    : `<D:getcontentlength>${String(node.data.length)}</D:getcontentlength>`;
  const lock =
    '<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>';
  const props = `<D:displayname>${href.split('/').pop() ?? ''}</D:displayname>${type}${length}<D:getlastmodified>${new Date(0).toUTCString()}</D:getlastmodified><D:getetag>"${String(node.data.length)}"</D:getetag>${lock}`;
  return `<D:response><D:href>${shown}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
};

const childrenOf = (hub: Hub, path: string): readonly (readonly [string, DavNode])[] =>
  [...hub.nodes].filter(
    ([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'),
  );

const blockedByLock = (hub: Hub, req: Req, path: string): boolean => {
  const token = hub.locks.get(path);
  return token !== undefined && !(req.headers['if'] ?? '').includes(token);
};

const propfind: Handler = (hub, req, res, path) => {
  const node = hub.nodes.get(path);
  if (!node) return send(res, 404);
  const rows = req.headers['depth'] === '0' || !node.dir ? [] : childrenOf(hub, path);
  const parts = [entry(path, node), ...rows.map(([key, child]) => entry(key, child))];
  const body = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${parts.join('')}</D:multistatus>`;
  return send(res, 207, { 'content-type': 'application/xml; charset=utf-8' }, body);
};

const rangeOf = (header: string | undefined, length: number): readonly [number, number] | null => {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  return [Number(match[1]), match[2] === '' ? length - 1 : Number(match[2])];
};

const get: Handler = (hub, req, res, path) => {
  const node = hub.nodes.get(path);
  if (!node || node.dir) return send(res, 404);
  const range = rangeOf(req.headers.range, node.data.length);
  const [start, end] = range ?? [0, node.data.length - 1];
  const slice = node.data.subarray(start, end + 1);
  const headers: Record<string, string | number> = { 'content-length': slice.length };
  if (range) headers['content-range'] = `bytes ${String(start)}-${String(end)}/*`;
  res.writeHead(range ? 206 : 200, headers);
  res.end(slice);
  return true;
};

const put: Handler = async (hub, req, res, path) => {
  const body = await readBody(req);
  if (blockedByLock(hub, req, path)) return send(res, 423);
  const status = hub.nodes.has(path) ? 204 : 201;
  hub.nodes.set(path, fresh(false, body));
  return send(res, status);
};

const mkcol: Handler = (hub, _req, res, path) => {
  if (hub.nodes.has(path)) return send(res, 405);
  hub.nodes.set(path, fresh(true));
  return send(res, 201);
};

const remove: Handler = (hub, req, res, path) => {
  if (!hub.nodes.has(path)) return send(res, 404);
  if (blockedByLock(hub, req, path)) return send(res, 423);
  for (const key of [...hub.nodes.keys()])
    if (key === path || key.startsWith(`${path}/`)) hub.nodes.delete(key);
  return send(res, 204);
};

const destinationOf = (req: Req): string =>
  decodeURIComponent(
    new URL(String(req.headers['destination'] ?? ''), 'http://stub').pathname.replace(/\/$/, ''),
  );

const move: Handler = (hub, req, res, path) => {
  const target = destinationOf(req);
  const overwritten = hub.nodes.has(target);
  const refusal = [
    [!target.startsWith(HUB_PREFIX), 502],
    [blockedByLock(hub, req, path), 423],
    [overwritten && req.headers['overwrite'] === 'F', 412],
  ].find(([failed]) => failed === true);
  if (refusal) return send(res, Number(refusal[1]));
  for (const [key, node] of [...hub.nodes]) {
    if (key !== path && !key.startsWith(`${path}/`)) continue;
    hub.nodes.set(target + key.slice(path.length), node);
    hub.nodes.delete(key);
  }
  return send(res, overwritten ? 204 : 201);
};

const lock: Handler = async (hub, req, res, path) => {
  await readBody(req);
  if (hub.locks.has(path)) return send(res, 423);
  const token = `opaquelocktoken:${randomBytes(8).toString('hex')}`;
  hub.locks.set(path, token);
  if (!hub.nodes.has(path)) hub.nodes.set(path, fresh(false));
  const body = `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:depth>0</D:depth><D:locktoken><D:href>${token}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`;
  return send(
    res,
    200,
    { 'content-type': 'application/xml; charset=utf-8', 'lock-token': `<${token}>` },
    body,
  );
};

const unlock: Handler = (hub, req, res, path) => {
  const token = String(req.headers['lock-token'] ?? '').replace(/[<>]/g, '');
  if (hub.locks.get(path) !== token) return send(res, 409);
  hub.locks.delete(path);
  return send(res, 204);
};

const HANDLERS: Readonly<Record<string, Handler>> = {
  OPTIONS: (_hub, _req, res) =>
    send(res, 200, {
      dav: '1, 2',
      allow: 'OPTIONS, GET, PUT, DELETE, MKCOL, MOVE, PROPFIND, LOCK',
    }),
  PROPFIND: propfind,
  GET: get,
  PUT: put,
  MKCOL: mkcol,
  DELETE: remove,
  MOVE: move,
  LOCK: lock,
  UNLOCK: unlock,
};

const startHub = async (): Promise<{ server: Server; port: number; hub: Hub }> => {
  const hub: Hub = { nodes: new Map([[HUB_ROOT, fresh(true)]]), locks: new Map() };
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${HUB_TOKEN}`) {
      send(res, 401);
      return;
    }
    const raw = decodeURIComponent(new URL(req.url ?? '/', 'http://stub').pathname);
    const path = raw.length > 1 ? raw.replace(/\/$/, '') : raw;
    const handler = HANDLERS[req.method ?? ''];
    if (!path.startsWith(HUB_ROOT) || !handler) {
      send(res, 404);
      return;
    }
    Promise.resolve(handler(hub, req, res, path)).catch(() => send(res, 500));
  });
  return { server, port: await listen(server), hub };
};

const rewriteHrefs = (xml: string, proxyPrefix: string): string =>
  xml.replaceAll(`<D:href>${HUB_PREFIX}`, `<D:href>${proxyPrefix}`);

const forward = (hubPort: number, proxyPrefix: string, req: Req, res: Res): void => {
  const url = new URL(req.url ?? '/', 'http://proxy');
  const toHub = (path: string): string => HUB_PREFIX + path.slice(proxyPrefix.length);
  const headers: OutgoingHttpHeaders = {
    ...req.headers,
    authorization: `Bearer ${HUB_TOKEN}`,
    host: `127.0.0.1:${String(hubPort)}`,
  };
  if (typeof req.headers['destination'] === 'string') {
    const target = new URL(req.headers['destination'], 'http://proxy');
    headers['destination'] = `http://127.0.0.1:${String(hubPort)}${toHub(target.pathname)}`;
  }
  const options = { host: '127.0.0.1', port: hubPort, method: req.method, headers };
  const upstream = httpRequest(
    { ...options, path: toHub(url.pathname) + url.search },
    (response) => {
      void readBody(response).then((raw) => {
        const rewritten = rewriteHrefs(raw.toString('utf8'), proxyPrefix);
        const body = response.statusCode === 207 ? Buffer.from(rewritten) : raw;
        const headers = { ...response.headers, 'content-length': String(body.length) };
        res.writeHead(response.statusCode ?? 502, headers);
        res.end(body);
      });
    },
  );
  upstream.on('error', () => send(res, 502));
  req.pipe(upstream);
};

const startProxy = async (
  hubPort: number,
  sessionPath: string,
): Promise<{ server: Server; port: number }> => {
  const proxyPrefix = `/${sessionPath}/`;
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://proxy').pathname;
    if (!pathname.startsWith(proxyPrefix) && `${pathname}/` !== proxyPrefix) {
      send(res, 404);
      return;
    }
    forward(hubPort, proxyPrefix, req, res);
  });
  return { server, port: await listen(server) };
};

const startStack = async (): Promise<{
  readonly hub: Hub;
  readonly hubPort: number;
  readonly proxyPort: number;
  readonly sessionPath: string;
  readonly stop: () => Promise<void>;
}> => {
  const sessionPath = randomBytes(16).toString('hex');
  const stub = await startHub();
  const proxy = await startProxy(stub.port, sessionPath);
  return {
    hub: stub.hub,
    hubPort: stub.port,
    proxyPort: proxy.port,
    sessionPath,
    stop: () => close(proxy.server, stub.server),
  };
};

const gioAvailable = existsSync('/usr/share/gvfs/mounts/dav.mount') && existsSync('/usr/bin/gio');

describe('WebDAV baseline through a loopback proxy', () => {
  let stack: Awaited<ReturnType<typeof startStack>>;
  let base: string;

  const dav = (method: string, path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${base}${path}`, { method, ...init });
  const code = async (method: string, path: string, init: RequestInit = {}): Promise<number> =>
    (await dav(method, path, init)).status;

  beforeAll(async () => {
    stack = await startStack();
    base = `http://127.0.0.1:${String(stack.proxyPort)}/${stack.sessionPath}/`;
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('refuses any path outside the random session path and keeps the hub behind the token', async () => {
    const method = 'PROPFIND';
    const outside = await fetch(`http://127.0.0.1:${String(stack.proxyPort)}/dav/root1/`, {
      method,
    });
    expect(outside.status).toBe(404);
    const direct = await fetch(`http://127.0.0.1:${String(stack.hubPort)}${HUB_PREFIX}`, {
      method,
    });
    expect(direct.status).toBe(401);
  });

  it('advertises class 2 and lists collections with hrefs rewritten into the proxy path', async () => {
    await dav('MKCOL', 'Docs');
    await dav('PUT', 'Docs/a.txt', { body: 'alpha' });
    const response = await dav('PROPFIND', '', { headers: { depth: '1' } });
    const xml = await response.text();
    expect((await dav('OPTIONS', '')).headers.get('dav')).toBe('1, 2');
    expect(response.status).toBe(207);
    expect(xml).toContain(`<D:href>/${stack.sessionPath}/Docs/</D:href>`);
    expect(xml).not.toContain(HUB_PREFIX);
  });

  it('reads whole files and byte ranges', async () => {
    await dav('PUT', 'Docs/range.bin', { body: '0123456789' });
    expect(await (await dav('GET', 'Docs/range.bin')).text()).toBe('0123456789');
    const ranged = await dav('GET', 'Docs/range.bin', { headers: { range: 'bytes=2-5' } });
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe('2345');
  });

  it('writes, overwrites and stores Finder resource-fork files like any file', async () => {
    expect(await code('PUT', 'Docs/b.txt', { body: 'one' })).toBe(201);
    expect(await code('PUT', 'Docs/b.txt', { body: 'two' })).toBe(204);
    expect(await code('PUT', 'Docs/._b.txt', { body: 'fork' })).toBe(201);
    expect(await (await dav('GET', 'Docs/b.txt')).text()).toBe('two');
  });

  it('renames with the Destination header translated to the hub path', async () => {
    const headers = { destination: `${base}Docs/renamed.txt`, overwrite: 'F' };
    expect(await code('MOVE', 'Docs/a.txt', { headers })).toBe(201);
    expect(await code('GET', 'Docs/a.txt')).toBe(404);
    expect(await (await dav('GET', 'Docs/renamed.txt')).text()).toBe('alpha');
    expect([...stack.hub.nodes.keys()]).toContain(`${HUB_PREFIX}Docs/renamed.txt`);
  });

  it('locks, blocks writers without the token, lets the holder write and unlocks', async () => {
    const locked = await dav('LOCK', 'Docs/lock.txt', {
      headers: { timeout: 'Second-600' },
      body: '<D:lockinfo xmlns:D="DAV:"/>',
    });
    const token = (locked.headers.get('lock-token') ?? '').replace(/[<>]/g, '');
    expect(locked.status).toBe(200);
    expect(token).toMatch(/^opaquelocktoken:/);
    expect(await code('PUT', 'Docs/lock.txt', { body: 'blocked' })).toBe(423);
    expect(
      await code('PUT', 'Docs/lock.txt', { headers: { if: `(<${token}>)` }, body: 'held' }),
    ).toBe(204);
    expect(await code('UNLOCK', 'Docs/lock.txt', { headers: { 'lock-token': `<${token}>` } })).toBe(
      204,
    );
    expect(await code('PUT', 'Docs/lock.txt', { body: 'free' })).toBe(204);
  });

  it('deletes a collection with its children', async () => {
    expect(await code('DELETE', 'Docs')).toBe(204);
    expect(await code('PROPFIND', 'Docs', { headers: { depth: '0' } })).toBe(404);
  });
});

describe.skipIf(!gioAvailable)('gio mount dav:// against the loopback proxy', () => {
  let stack: Awaited<ReturnType<typeof startStack>>;
  let uri: string;

  const gio = async (...args: string[]): Promise<string> =>
    (await run('gio', args, { timeout: 30_000 })).stdout;

  beforeAll(async () => {
    stack = await startStack();
    uri = `dav://127.0.0.1:${String(stack.proxyPort)}/${stack.sessionPath}/`;
    await gio('mount', uri);
  });

  afterAll(async () => {
    await gio('mount', '-u', uri).catch(() => '');
    await stack.stop();
  });

  it('browses, reads, writes, renames and deletes', async () => {
    await gio('mkdir', `${uri}Docs`);
    await run('sh', ['-c', `printf hello | gio save "${uri}Docs/a.txt"`]);
    expect(await gio('list', `${uri}Docs`)).toContain('a.txt');
    expect(await gio('cat', `${uri}Docs/a.txt`)).toBe('hello');
    await gio('move', `${uri}Docs/a.txt`, `${uri}Docs/b.txt`);
    expect(await gio('list', `${uri}Docs`)).toContain('b.txt');
    await gio('remove', `${uri}Docs/b.txt`);
    expect(await gio('list', `${uri}Docs`)).not.toContain('b.txt');
  });
});
