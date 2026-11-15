import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  API_ERROR,
  ApiError,
  RELEASE_UPLOAD,
  RELEASE_UPLOAD_LIST,
  matchPath,
  type ReleaseUpload,
  type Role,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import type { HubLayout } from '../../src/data-layout';
import { partCallOf } from '../../src/extensions/mcp/tools';
import type { AcceptedCaller } from '../../src/extensions/mcp/bearer';
import { discardStagedUpload } from '../../src/extensions/mcp/tools/update-staged-upload';
import { trustReleaseKey } from '../../src/releases/trust';
import { unpackReleaseTar } from '../../src/releases/release-tar';
import { releaseStaging, type ReleaseStaging } from '../../src/releases/staging';
import { ReleaseVerificationError } from '../../src/releases/verify';
import { releaseChunkRoute, releaseUploadEndpoints } from '../../src/releases/upload-routes';
import { authenticate, type Caller } from '../../src/server/auth';
import { BODY_LIMIT, parseJsonBody, readBody, sendError, sendJson } from '../../src/server/http';
import { assertOwnerRoute } from '../../src/server/owner-route';
import { testLogger } from '../support/logs';
import { tokenIssuer } from '../support/machine-update-hub';
import { testStore, type TestStore } from '../support/store';
import { releaseSigner, scratch, sha256, writeBundle } from './release-fixture';

const signer = releaseSigner();

const NOW = new Date('2026-11-14T10:00:00.000Z');

interface Hub {
  readonly url: URL;
  readonly layout: HubLayout;
  readonly staging: ReleaseStaging;
  readonly store: TestStore['store'];
  readonly tokenFor: (role: Role) => string;
  readonly close: () => Promise<void>;
}

let hub: Hub;
let free: number;

async function startHub(): Promise<Hub> {
  const opened: TestStore = await testStore();
  const { store, layout } = opened;
  const staging = releaseStaging(
    layout,
    () => NOW,
    () => Promise.resolve(free),
  );
  const endpoints = Object.values(releaseUploadEndpoints(staging));
  const chunks = releaseChunkRoute(store, staging);
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://hub');
    for (const entry of endpoints) {
      const params = matchPath(entry.endpoint.path, url.pathname);
      if (entry.endpoint.method !== request.method || params === null) continue;
      const caller = authenticate(store, request, entry.endpoint.access, false);
      assertOwnerRoute(store, caller, entry.endpoint);
      const body = parseJsonBody(request, await readBody(request, BODY_LIMIT));
      sendJson(
        response,
        200,
        await entry.run(
          caller,
          { params, query: {}, body, remote: '127.0.0.1', headers: {} },
          testLogger(),
        ),
      );
      return;
    }
    const params = matchPath(chunks.path, url.pathname);
    if (request.method !== 'PUT' || params === null)
      throw new ApiError('not_found', 'There is no route at this address.');
    await chunks.handle(request, response, params);
  };
  const server = createServer((request, response) => {
    handle(request, response).catch((cause: unknown) => {
      if (cause instanceof ApiError) sendError(response, cause);
      else {
        response.writeHead(500).end();
        throw cause;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  return {
    url: new URL(`http://127.0.0.1:${String(address.port)}`),
    layout,
    staging,
    store,
    tokenFor: tokenIssuer(store),
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await opened.close();
    },
  };
}

beforeEach(async () => {
  free = Number.MAX_SAFE_INTEGER;
  hub = await startHub();
  await trustReleaseKey(
    hub.layout.system.keys.releaseKeys,
    { publicKey: signer.publicKey, role: 'machine', label: 'Dev PC' },
    NOW,
  );
});

afterEach(async () => {
  await hub.close();
});

function send(
  method: string,
  path: string,
  options: {
    readonly role?: Role | null;
    readonly json?: unknown;
    readonly bytes?: Buffer;
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  const role = options.role === undefined ? 'owner' : options.role;
  if (role !== null) headers['authorization'] = `Bearer ${hub.tokenFor(role)}`;
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  return fetch(new URL(path, hub.url), {
    method,
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    ...(options.bytes === undefined ? {} : { body: new Uint8Array(options.bytes) }),
  });
}

async function uploadOf(reply: Response): Promise<ReleaseUpload> {
  expect(reply.status).toBe(200);
  return RELEASE_UPLOAD.parse(await reply.json());
}

function discardThroughUpdateControl(uploadId: string, owner: boolean): Promise<unknown> {
  const call = partCallOf('update_control', { action: 'discard', upload: uploadId });
  expect(call).toStrictEqual({ name: 'update_discard', args: { upload: uploadId } });
  const caller = {
    kind: 'accepted',
    via: 'personal',
    id: randomUUID(),
    localOnly: true,
    readOnly: false,
  } satisfies AcceptedCaller;
  return discardStagedUpload(
    {
      store: hub.store,
      layout: hub.layout,
      clock: { ...systemClock, now: () => NOW },
      actor: null,
      caller: owner ? caller : null,
    },
    uploadId,
  );
}

async function errorCode(reply: Response): Promise<string> {
  return API_ERROR.parse(await reply.json()).error.code;
}

function begin(bundle: Buffer, sha = sha256(bundle), role: Role = 'owner'): Promise<Response> {
  return send('POST', '/api/releases/uploads', {
    role,
    json: { artifact: 'ui', size: bundle.length, sha256: sha },
  });
}

function chunk(
  uploadId: string,
  offset: number,
  bytes: Buffer,
  role: Role = 'owner',
): Promise<Response> {
  return send('PUT', `/api/releases/uploads/${uploadId}/chunks/${String(offset)}`, {
    role,
    bytes,
  });
}

function finish(uploadId: string, role: Role = 'owner'): Promise<Response> {
  return send('POST', `/api/releases/uploads/${uploadId}/finish`, { role });
}

async function signedTar(): Promise<Buffer> {
  const { root, close } = await scratch();
  try {
    const bundle = join(root, 'bundle');
    await mkdir(bundle);
    await writeBundle(bundle, signer, {
      files: { 'bundle/index.js': 'console.log(1);', [`${'deep/'.repeat(30)}a.png`]: 'png' },
    });
    const tar = join(root, 'bundle.tar');
    execFileSync('tar', ['--format=pax', '-cf', tar, '-C', bundle, '.']);
    return await readFile(tar);
  } finally {
    await close();
  }
}

function header(name: string, type: string, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, 'utf8');
  block.write('0000600\0', 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write(type, 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

function craftedTar(entries: readonly { name: string; type: string; body?: string }[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '');
    parts.push(header(entry.name, entry.type, body.length));
    parts.push(Buffer.concat([body, Buffer.alloc((512 - (body.length % 512)) % 512)]));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

async function uploaded(bundle: Buffer, pieces = 3): Promise<ReleaseUpload> {
  const upload = await uploadOf(await begin(bundle));
  const step = Math.ceil(bundle.length / pieces);
  const offsets = Array.from({ length: pieces }, (_, index) => index * step).reverse();
  for (const offset of offsets)
    await uploadOf(await chunk(upload.uploadId, offset, bundle.subarray(offset, offset + step)));
  return upload;
}

describe('the release upload routes', () => {
  it('refuses members, callers without a token and an owner over MCP', async () => {
    const bundle = await signedTar();
    expect((await begin(bundle, sha256(bundle), 'member')).status).toBe(403);
    expect(
      (
        await send('POST', '/api/releases/uploads', {
          role: null,
          json: { artifact: 'ui', size: 1, sha256: sha256('x') },
        })
      ).status,
    ).toBe(401);
    const upload = await uploadOf(await begin(bundle));
    expect((await chunk(upload.uploadId, 0, bundle, 'member')).status).toBe(403);
    expect((await finish(upload.uploadId, 'member')).status).toBe(403);
    expect((await send('GET', '/api/releases/uploads', { role: 'member' })).status).toBe(403);
    const client = hub.store.clients.create({
      name: 'Owner PC',
      platform: 'desktop',
      role: 'owner',
      tokenHash: 'b'.repeat(64),
    });
    const overMcp: Caller = { kind: 'client', client, mcpOrigin: 'computer' };
    const entry = releaseUploadEndpoints(hub.staging).beginReleaseUpload;
    const outcome = await entry
      .run(
        overMcp,
        {
          params: {},
          query: {},
          body: { artifact: 'ui', size: 1, sha256: sha256('x') },
          remote: '127.0.0.1',
          headers: {},
        },
        testLogger(),
      )
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(outcome).toBeInstanceOf(ApiError);
    expect(outcome).toMatchObject({ code: 'forbidden' });
  });

  it('accepts chunks out of order, resumes the missing ranges and stages a verified release', async () => {
    const bundle = await signedTar();
    const upload = await uploadOf(await begin(bundle));
    expect(upload).toMatchObject({ state: 'receiving', received: [], receivedBytes: 0 });
    const half = Math.floor(bundle.length / 2);
    await uploadOf(await chunk(upload.uploadId, half, bundle.subarray(half)));
    const incomplete = await finish(upload.uploadId);
    expect(incomplete.status).toBe(409);
    const resumed = await uploadOf(await send('GET', `/api/releases/uploads/${upload.uploadId}`));
    expect(resumed.received).toStrictEqual([{ start: half, end: bundle.length }]);
    await uploadOf(await chunk(upload.uploadId, 0, bundle.subarray(0, half + 10)));
    const staged = await uploadOf(await finish(upload.uploadId));
    expect(staged.state).toBe('staged');
    expect(staged.receivedBytes).toBe(bundle.length);
    expect(staged.release).toStrictEqual({
      version: '1.2.3',
      commit: 'a'.repeat(40),
      target: 'android',
      fingerprint: signer.fingerprint,
      files: 2,
      bytes: 18,
    });
    expect(await uploadOf(await finish(upload.uploadId))).toStrictEqual(staged);
    const directory = join(hub.layout.system.updates.releaseStaging, upload.uploadId);
    expect((await readdir(directory)).sort()).toStrictEqual(['release', 'upload.json']);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, 'release', 'release.json'))).mode & 0o777).toBe(0o600);
    expect(
      await readFile(
        join(hub.staging.releaseDirectory(staged), 'files', 'bundle', 'index.js'),
        'utf8',
      ),
    ).toBe('console.log(1);');
    const listed = await uploadOf(await send('GET', `/api/releases/uploads/${upload.uploadId}`));
    expect(listed).toStrictEqual(staged);
    const all = RELEASE_UPLOAD_LIST.parse(
      await (await send('GET', '/api/releases/uploads')).json(),
    );
    expect(all.uploads.map((item) => item.uploadId)).toStrictEqual([upload.uploadId]);
    expect((await chunk(upload.uploadId, 0, bundle.subarray(0, 4))).status).toBe(409);
  });

  it('refuses a bundle whose bytes do not match the sha256 given at the start', async () => {
    const bundle = await signedTar();
    const upload = await uploadOf(await begin(bundle, sha256('something else')));
    await uploadOf(await chunk(upload.uploadId, 0, bundle));
    const reply = await finish(upload.uploadId);
    expect(reply.status).toBe(400);
    expect(await errorCode(reply)).toBe('invalid_request');
    const kept = await uploadOf(await send('GET', `/api/releases/uploads/${upload.uploadId}`));
    expect(kept.state).toBe('receiving');
    expect(
      await readdir(join(hub.layout.system.updates.releaseStaging, upload.uploadId)),
    ).not.toContain('release');
  });

  it('refuses a chunk that runs past the declared size and records none of it', async () => {
    const bundle = await signedTar();
    const upload = await uploadOf(await begin(bundle));
    const over = await chunk(upload.uploadId, bundle.length - 4, Buffer.alloc(8, 1));
    expect(over.status).toBe(413);
    expect((await chunk(upload.uploadId, bundle.length, Buffer.alloc(1, 1))).status).toBe(413);
    const after = await uploadOf(await send('GET', `/api/releases/uploads/${upload.uploadId}`));
    expect(after.received).toStrictEqual([]);
    const tar = join(hub.layout.system.updates.releaseStaging, upload.uploadId, 'bundle.tar');
    expect((await stat(tar)).size).toBe(bundle.length);
  });

  it('refuses to begin when the disk has too little free space for the bundle', async () => {
    const bundle = await signedTar();
    free = bundle.length * 2 - 1;
    const reply = await begin(bundle);
    expect(reply.status).toBe(413);
    expect(await errorCode(reply)).toBe('payload_too_large');
    expect(await hub.staging.list()).toStrictEqual([]);
    free = bundle.length * 2;
    expect((await begin(bundle)).status).toBe(200);
  });

  it('refuses a finish and further chunks after the upload was discarded', async () => {
    const bundle = await signedTar();
    const upload = await uploaded(bundle);
    await expect(discardThroughUpdateControl(upload.uploadId, false)).rejects.toThrow(
      /Only the owner/,
    );
    expect((await hub.staging.list()).map((kept) => kept.uploadId)).toStrictEqual([
      upload.uploadId,
    ]);
    const discarded = await discardThroughUpdateControl(upload.uploadId, true);
    expect(discarded).toMatchObject({
      structured: { discarded: { uploadId: upload.uploadId, state: 'receiving' } },
    });
    await expect(
      lstat(join(hub.layout.system.updates.releaseStaging, upload.uploadId)),
    ).rejects.toThrow();
    const reply = await finish(upload.uploadId);
    expect(reply.status).toBe(404);
    expect((await chunk(upload.uploadId, 0, bundle)).status).toBe(404);
    await expect(discardThroughUpdateControl(upload.uploadId, true)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await send('DELETE', `/api/releases/uploads/${upload.uploadId}`)).status).toBe(404);
  });

  it('discards a staged release through update_control too', async () => {
    const bundle = await signedTar();
    const upload = await uploaded(bundle);
    await uploadOf(await finish(upload.uploadId));
    expect(await discardThroughUpdateControl(upload.uploadId, true)).toMatchObject({
      structured: { discarded: { uploadId: upload.uploadId, state: 'staged' } },
    });
    expect(await hub.staging.list()).toStrictEqual([]);
  });

  it('refuses a release signed by a key the Hub does not trust', async () => {
    const other = releaseSigner();
    const { root, close } = await scratch();
    try {
      const bundle = join(root, 'bundle');
      await mkdir(bundle);
      await writeBundle(bundle, other);
      const tar = join(root, 'bundle.tar');
      execFileSync('tar', ['--format=pax', '-cf', tar, '-C', bundle, '.']);
      const upload = await uploaded(await readFile(tar));
      const reply = await finish(upload.uploadId);
      expect(reply.status).toBe(400);
      expect(API_ERROR.parse(await reply.json()).error.message).toMatch(/unknown_key/u);
    } finally {
      await close();
    }
  });
});

describe('unpacking a release tar', () => {
  let root: string;
  let close: () => Promise<void>;
  let attempts = 0;

  beforeEach(async () => {
    ({ root, close } = await scratch());
  });

  afterEach(async () => {
    await close();
  });

  async function unpacked(tar: Buffer): Promise<unknown> {
    attempts += 1;
    const file = join(root, `bundle-${String(attempts)}.tar`);
    await writeFile(file, tar);
    return unpackReleaseTar(file, join(root, `out-${String(attempts)}`)).then(
      () => null,
      (cause: unknown) => (cause instanceof ReleaseVerificationError ? cause.reason : cause),
    );
  }

  it.each([
    [
      'a path that climbs out',
      [{ name: 'files/../../escape', type: '0', body: 'x' }],
      'unsafe_path',
    ],
    ['an absolute path', [{ name: '/etc/passwd', type: '0', body: 'x' }], 'unsafe_path'],
    ['a symbolic link', [{ name: 'files/link', type: '2' }], 'unsafe_path'],
    ['a hard link', [{ name: 'files/link', type: '1' }], 'unsafe_path'],
    ['an entry outside the bundle shape', [{ name: 'other.txt', type: '0', body: 'x' }], 'layout'],
    [
      'the same file twice',
      [
        { name: 'files/a', type: '0', body: 'x' },
        { name: 'files/a', type: '0', body: 'y' },
      ],
      'layout',
    ],
  ])('refuses %s', async (_, entries, reason) => {
    expect(await unpacked(craftedTar(entries))).toBe(reason);
  });

  it('refuses a damaged header and a missing end marker', async () => {
    const tar = craftedTar([{ name: 'files/a', type: '0', body: 'x' }]);
    const damaged = Buffer.from(tar);
    damaged[10] = 0x41;
    expect(await unpacked(damaged)).toBe('layout');
    expect(await unpacked(tar.subarray(0, 1024))).toBe('layout');
  });

  it('unpacks plain files and folders', async () => {
    expect(
      await unpacked(
        craftedTar([
          { name: 'files/', type: '5' },
          { name: 'files/a/b.txt', type: '0', body: 'hello' },
          { name: 'release.json', type: '0', body: '{}' },
        ]),
      ),
    ).toBeNull();
    expect(
      await readFile(join(root, `out-${String(attempts)}`, 'files', 'a', 'b.txt'), 'utf8'),
    ).toBe('hello');
  });
});
