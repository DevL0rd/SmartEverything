import { createServer, type Server } from 'node:http';
import { ApiError, matchPath } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sendError } from '../../src/server/http';
import { sha256Of } from '../../src/store/repositories/model-assets';
import { captureLogs } from '../support/logs';
import { jsonBytes, specOf } from './model-fixtures';
import { gridGlb } from './glb-lod-fixtures';
import { harness, type Harness } from './route-fixtures';

const MESSAGE = z.object({ error: z.object({ message: z.string() }) });

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

let h: Harness;
let server: Server;
let base: string;

beforeEach(async () => {
  captureLogs();
  h = await harness();
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://server').pathname;
    const route = h.rawRoutes.find(
      (candidate) =>
        candidate.method === request.method && matchPath(candidate.path, pathname) !== null,
    );
    if (route === undefined) {
      response.writeHead(404).end();
      return;
    }
    route
      .handle(request, response, matchPath(route.path, pathname) ?? {})
      .catch((cause: unknown) => {
        sendError(response, cause instanceof ApiError ? cause : new ApiError('internal', 'failed'));
      });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the server has no port');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await h.close();
});

function padded(bytes: Uint8Array, fill: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
  out.set(bytes);
  return out;
}

function triangleGlb(): Uint8Array {
  const bin = new Uint8Array(44);
  const view = new DataView(bin.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  [0, 1, 2].forEach((value, index) => {
    view.setUint16(36 + index * 2, value, true);
  });
  const json = padded(
    jsonBytes({
      asset: { version: '2.0' },
      buffers: [{ byteLength: 44 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
    }),
    0x20,
  );
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const header = new DataView(out.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, total, true);
  header.setUint32(12, json.length, true);
  header.setUint32(16, JSON_TYPE, true);
  out.set(json, 20);
  header.setUint32(20 + json.length, bin.length, true);
  header.setUint32(24 + json.length, BIN_TYPE, true);
  out.set(bin, 28 + json.length);
  return out;
}

function get(
  path: string,
  token: string | null,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${base}${path}`, {
    headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...headers },
  });
}

function upload(token: string | null, body: unknown, type = 'application/json'): Promise<Response> {
  return fetch(`${base}/api/model-assets`, {
    method: 'POST',
    headers: {
      'content-type': type,
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('serving a stored model file', () => {
  it('sends the bytes with an immutable cache and the hash as the tag', async () => {
    const bytes = jsonBytes(specOf());
    const row = h.assets.save({ kind: 'spec', owner: 'builtin', bytes });
    const reply = await get(`/api/model-assets/${row.sha256}`, h.tokens.member);
    expect(reply.status).toBe(200);
    expect(reply.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(reply.headers.get('etag')).toBe(`"${row.sha256}"`);
    expect(reply.headers.get('content-type')).toBe('application/json');
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await reply.arrayBuffer())).toStrictEqual(bytes);
  });

  it('answers 304 with no body when the tag matches', async () => {
    const row = h.assets.save({ kind: 'spec', owner: 'builtin', bytes: jsonBytes(specOf()) });
    const reply = await get(`/api/model-assets/${row.sha256}`, h.tokens.member, {
      'if-none-match': `"${row.sha256}"`,
    });
    expect(reply.status).toBe(304);
    expect(reply.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await reply.text()).toBe('');
  });

  it('serves a byte range of a file', async () => {
    const bytes = jsonBytes(specOf());
    const row = h.assets.save({ kind: 'spec', owner: 'builtin', bytes });
    const reply = await get(`/api/model-assets/${row.sha256}`, h.tokens.member, {
      range: 'bytes=2-9',
    });
    expect(reply.status).toBe(206);
    expect(new Uint8Array(await reply.arrayBuffer())).toStrictEqual(bytes.slice(2, 10));
  });

  it('refuses a missing token, a bad hash and an unknown hash', async () => {
    const row = h.assets.save({ kind: 'spec', owner: 'builtin', bytes: jsonBytes(specOf()) });
    expect((await get(`/api/model-assets/${row.sha256}`, null)).status).toBe(401);
    expect((await get('/api/model-assets/not-a-hash', h.tokens.member)).status).toBe(400);
    expect((await get(`/api/model-assets/${'0'.repeat(64)}`, h.tokens.member)).status).toBe(404);
  });
});

describe('uploading a model file', () => {
  it('lets the owner store a spec and then serves it by its hash', async () => {
    const bytes = jsonBytes(specOf('dev.fan.mine'));
    const reply = await upload(h.tokens.owner, { kind: 'spec', data: base64(bytes) });
    expect(reply.status).toBe(200);
    expect(await reply.json()).toStrictEqual({
      sha256: sha256Of(bytes),
      kind: 'spec',
      size: bytes.byteLength,
      model_id: 'dev.fan.mine',
    });
    const served = await get(`/api/model-assets/${sha256Of(bytes)}`, h.tokens.member);
    expect(new Uint8Array(await served.arrayBuffer())).toStrictEqual(bytes);
  });

  it('stores a valid GLB as a model file and serves it with its own type', async () => {
    const bytes = triangleGlb();
    const reply = await upload(h.tokens.owner, { kind: 'glb', data: base64(bytes) });
    expect(reply.status).toBe(200);
    expect(await reply.json()).toStrictEqual({
      sha256: sha256Of(bytes),
      kind: 'glb',
      size: bytes.byteLength,
      model_id: null,
    });
    expect(h.assets.find(sha256Of(bytes))?.owner).toMatch(/^user:/u);
    const served = await get(`/api/model-assets/${sha256Of(bytes)}`, h.tokens.member);
    expect(served.headers.get('content-type')).toBe('model/gltf-binary');
  });

  it('stores the three decimated levels of a GLB linked to the uploaded file', async () => {
    const bytes = gridGlb({ side: 60 });
    const reply = await upload(h.tokens.owner, { kind: 'glb', data: base64(bytes) });
    expect(reply.status).toBe(200);
    const source = sha256Of(bytes);
    const levels = h.assets.lodsOf(source);
    expect(levels.map((level) => level.level)).toStrictEqual([0, 1, 2]);
    const sizes = levels.map((level) => h.assets.bytes(level.sha256)?.size ?? 0);
    expect(sizes[0]).toBeLessThan(sizes[1] ?? 0);
    expect(sizes[1]).toBeLessThan(sizes[2] ?? 0);
    expect(new Set(levels.map((level) => level.sha256)).size).toBe(3);
    for (const level of levels) {
      const stored = h.assets.find(level.sha256);
      expect(stored?.kind).toBe('glb');
      expect(stored?.owner).toBe(h.assets.find(source)?.owner);
      const served = await get(`/api/model-assets/${level.sha256}`, h.tokens.member);
      expect(served.headers.get('content-type')).toBe('model/gltf-binary');
    }
  });

  it('keeps a small GLB as every level without storing it twice', async () => {
    const bytes = triangleGlb();
    await upload(h.tokens.owner, { kind: 'glb', data: base64(bytes) });
    const source = sha256Of(bytes);
    expect(h.assets.lodsOf(source).map((level) => level.sha256)).toStrictEqual([
      source,
      source,
      source,
    ]);
    expect(h.assets.all()).toHaveLength(1);
  });

  it('refuses a member, a missing token and a body that is not an upload', async () => {
    const data = base64(jsonBytes(specOf()));
    expect((await upload(h.tokens.member, { kind: 'spec', data })).status).toBe(403);
    expect((await upload(null, { kind: 'spec', data })).status).toBe(401);
    expect((await upload(h.tokens.owner, { kind: 'zip', data })).status).toBe(400);
    expect((await upload(h.tokens.owner, { kind: 'spec', data: '***' })).status).toBe(400);
    expect((await upload(h.tokens.owner, '', 'application/json')).status).toBe(400);
    expect((await upload(h.tokens.owner, 'kind=spec', 'text/plain')).status).toBe(415);
    expect(h.assets.all()).toStrictEqual([]);
  });

  it('refuses a spec or a GLB that fails its checks and stores nothing', async () => {
    const badSpec = await upload(h.tokens.owner, {
      kind: 'spec',
      data: base64(jsonBytes({ schema: 1, id: 'dev.fan.broken' })),
    });
    expect(badSpec.status).toBe(400);
    const badGlb = await upload(h.tokens.owner, {
      kind: 'glb',
      data: base64(new TextEncoder().encode('not a glb file')),
    });
    expect(badGlb.status).toBe(400);
    expect(MESSAGE.parse(await badGlb.json()).error.message).toContain('refused');
    expect(h.assets.all()).toStrictEqual([]);
  });
});
