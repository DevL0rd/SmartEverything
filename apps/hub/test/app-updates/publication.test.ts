import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APP_UPDATE_CHANGE,
  APP_UPDATE_ENTRY,
  APP_UPDATE_PRUNED,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdatePublication,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blobFile, readIndex } from '../../src/app-updates/store';
import { startAppUpdateHub, type AppUpdateHub } from '../support/app-update-hub';

const DESKTOP_QUERY = { platform: 'desktop', channel: 'dev', runtimeVersion: 'rt-1' } as const;
const FIRST = new Date('2026-10-25T10:00:00.000Z');
const LATER = (minutes: number): Date => new Date(FIRST.getTime() + minutes * 60_000);

let hub: AppUpdateHub;

beforeEach(async () => {
  hub = await startAppUpdateHub({ tls: false });
  hub.setNow(FIRST);
});

afterEach(async () => {
  await hub.close();
});

function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileOf(path: string, bytes: Buffer, contentType = 'text/html'): AppUpdateFile {
  return { path, sha256: sha(bytes), size: bytes.length, contentType };
}

function hermes(): Buffer {
  const body = Buffer.alloc(128);
  Buffer.from('c61fbc03c103191f', 'hex').copy(body);
  body.write('SHA-256', 64);
  body.writeUInt32LE(body.length + 20, 32);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]);
}

function send(
  method: string,
  path: string,
  options: { readonly token?: string; readonly json?: unknown; readonly bytes?: Buffer } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  return fetch(new URL(path, hub.url), {
    method,
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    ...(options.bytes === undefined ? {} : { body: new Uint8Array(options.bytes) }),
  });
}

function upload(
  bytes: Buffer,
  token = hub.tokenFor('owner'),
  name = sha(bytes),
): Promise<Response> {
  return send('PUT', `/api/app-updates/blobs/${name}`, { token, bytes });
}

function post(path: string, json: unknown, token = hub.tokenFor('owner')): Promise<Response> {
  return send('POST', path, { token, json });
}

function desktop(files: readonly AppUpdateFile[]): AppUpdatePublication {
  return {
    platform: 'desktop',
    channel: 'dev',
    runtimeVersion: 'rt-1',
    appVersion: '1.0.0',
    notes: 'A release note.',
    launch: null,
    files: [...files],
    expoClient: null,
  };
}

function android(launch: AppUpdateFile, channel: 'dev' | 'release'): AppUpdatePublication {
  return {
    platform: 'android',
    channel,
    runtimeVersion: 'rt-1',
    appVersion: '1.0.0',
    notes: 'An Android note.',
    launch,
    files: [],
    expoClient: { android: { package: 'com.example.app' } },
  };
}

async function publishPage(text: string): Promise<AppUpdateEntry> {
  const bytes = Buffer.from(text);
  expect((await upload(bytes)).status).toBe(200);
  const reply = await post('/api/app-updates', desktop([fileOf('index.html', bytes)]));
  expect(reply.status).toBe(200);
  return APP_UPDATE_ENTRY.parse(await reply.json());
}

async function publishBundle(bytes: Buffer, channel: 'dev' | 'release'): Promise<Response> {
  expect((await upload(bytes)).status).toBe(200);
  return post(
    '/api/app-updates',
    android(fileOf('entry.hbc', bytes, 'application/javascript'), channel),
  );
}

describe('uploading an update file', () => {
  it('stores the bytes under their sha256 and answers with the sha256 and size', async () => {
    const bytes = Buffer.from('<html>one</html>');
    const reply = await upload(bytes);
    expect(await reply.json()).toStrictEqual({ sha256: sha(bytes), size: bytes.length });
    expect(await readFile(blobFile(hub.layout, sha(bytes)))).toStrictEqual(bytes);
  });

  it('refuses callers that are not the owner and callers without a token', async () => {
    const bytes = Buffer.from('x');
    expect((await upload(bytes, hub.tokenFor('member'))).status).toBe(403);
    expect((await send('PUT', `/api/app-updates/blobs/${sha(bytes)}`, { bytes })).status).toBe(401);
    expect(await readdir(join(hub.layout.system.updates.appUpdates)).catch(() => [])).toStrictEqual(
      [],
    );
  });

  it('refuses bytes that do not match the name and leaves nothing stored', async () => {
    const reply = await upload(
      Buffer.from('actual'),
      hub.tokenFor('owner'),
      sha(Buffer.from('promised')),
    );
    expect(reply.status).toBe(400);
    expect(await readdir(join(hub.layout.system.updates.appUpdates, 'blobs'))).toStrictEqual([]);
  });

  it.each(['short', 'A'.repeat(64), '..%2Fescape'])('refuses the name %s', async (name) => {
    expect((await upload(Buffer.from('x'), hub.tokenFor('owner'), name)).status).toBe(400);
  });
});

describe('publishing an update', () => {
  it('records the update with a hub-assigned id and time and offers it at once', async () => {
    const entry = await publishPage('<html>v1</html>');
    expect(entry.createdAt).toBe(FIRST.toISOString());
    expect(entry.withdrawn).toBeNull();
    expect((await readIndex(hub.layout)).entries).toStrictEqual([entry]);
    const offer = await hub.updates.offer(DESKTOP_QUERY);
    expect(offer.compatible?.id).toBe(entry.id);
    expect(offer.compatible?.files.map((file) => file.path)).toStrictEqual(['index.html']);
  });

  it('refuses callers that are not the owner', async () => {
    const bytes = Buffer.from('<html>v1</html>');
    await upload(bytes);
    const body = desktop([fileOf('index.html', bytes)]);
    expect((await post('/api/app-updates', body, hub.tokenFor('member'))).status).toBe(403);
    expect((await readIndex(hub.layout)).entries).toStrictEqual([]);
  });

  it('refuses a file that was never uploaded', async () => {
    const reply = await post(
      '/api/app-updates',
      desktop([fileOf('index.html', Buffer.from('gone'))]),
    );
    expect(reply.status).toBe(400);
    expect((await readIndex(hub.layout)).entries).toStrictEqual([]);
  });

  it('refuses a file whose size differs from the stored bytes', async () => {
    const bytes = Buffer.from('<html>sized</html>');
    await upload(bytes);
    const claimed = { ...fileOf('index.html', bytes), size: bytes.length + 1 };
    expect((await post('/api/app-updates', desktop([claimed]))).status).toBe(400);
  });

  it('refuses the same content again and a change that is not newer, then accepts a newer change', async () => {
    const first = await publishPage('<html>v1</html>');
    const same = Buffer.from('<html>v1</html>');
    const again = await post('/api/app-updates', desktop([fileOf('index.html', same)]));
    expect(again.status).toBe(409);
    const changed = Buffer.from('<html>v2</html>');
    await upload(changed);
    const body = desktop([fileOf('index.html', changed)]);
    expect((await post('/api/app-updates', body)).status).toBe(409);
    hub.setNow(LATER(5));
    const accepted = await post('/api/app-updates', body);
    expect(accepted.status).toBe(200);
    expect(APP_UPDATE_ENTRY.parse(await accepted.json()).id).not.toBe(first.id);
  });

  it('refuses an Android release whose launch bundle is not Hermes bytecode and accepts one on dev', async () => {
    const plain = Buffer.from('console.log(1)');
    expect((await publishBundle(plain, 'release')).status).toBe(400);
    hub.setNow(LATER(1));
    expect((await publishBundle(plain, 'dev')).status).toBe(200);
  });

  it('accepts an Android release with a valid Hermes bundle', async () => {
    const reply = await publishBundle(hermes(), 'release');
    expect(reply.status).toBe(200);
    expect(APP_UPDATE_ENTRY.parse(await reply.json()).platform).toBe('android');
  });
});

describe('promoting, withdrawing, rolling back and pruning', () => {
  it('copies an update to another channel under a new id and time', async () => {
    const source = await publishPage('<html>v1</html>');
    hub.setNow(LATER(5));
    const reply = await post('/api/app-updates/promote', { id: source.id, channel: 'release' });
    const [copy] = APP_UPDATE_CHANGE.parse(await reply.json()).entries;
    expect(copy?.channel).toBe('release');
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.createdAt).toBe(LATER(5).toISOString());
  });

  it('answers not found for an unknown id and conflict for a withdrawn one', async () => {
    const source = await publishPage('<html>v1</html>');
    expect(
      (await post('/api/app-updates/promote', { id: crypto.randomUUID(), channel: 'release' }))
        .status,
    ).toBe(404);
    hub.setNow(LATER(5));
    expect((await post('/api/app-updates/withdraw', { id: source.id, reason: 'bad' })).status).toBe(
      200,
    );
    expect(
      (await post('/api/app-updates/promote', { id: source.id, channel: 'release' })).status,
    ).toBe(409);
  });

  it('refuses to promote an Android bundle that is not Hermes bytecode to release', async () => {
    const plain = Buffer.from('console.log(1)');
    const published = APP_UPDATE_ENTRY.parse(await (await publishBundle(plain, 'dev')).json());
    hub.setNow(LATER(5));
    const reply = await post('/api/app-updates/promote', { id: published.id, channel: 'release' });
    expect(reply.status).toBe(400);
    expect((await readIndex(hub.layout)).entries).toHaveLength(1);
  });

  it('republishes the previous good update when the newest is withdrawn', async () => {
    const first = await publishPage('<html>v1</html>');
    hub.setNow(LATER(5));
    const second = await publishPage('<html>v2</html>');
    hub.setNow(LATER(10));
    const reply = await post('/api/app-updates/withdraw', { id: second.id, reason: 'broken' });
    const { entries } = APP_UPDATE_CHANGE.parse(await reply.json());
    expect(entries.map((entry) => entry.withdrawn?.reason ?? 'live')).toStrictEqual([
      'broken',
      'live',
    ]);
    const offer = await hub.updates.offer(DESKTOP_QUERY);
    expect(offer.compatible?.id).toBe(entries[1]?.id);
    expect(offer.compatible?.id).not.toBe(first.id);
  });

  it('rolls a channel back to the embedded build', async () => {
    await publishPage('<html>v1</html>');
    hub.setNow(LATER(5));
    const reply = await post('/api/app-updates/rollback', {
      platform: 'desktop',
      channel: 'dev',
      reason: 'start over',
      toEmbedded: true,
    });
    expect(reply.status).toBe(200);
    expect((await hub.updates.offer(DESKTOP_QUERY)).compatible).toBeNull();
  });

  it('refuses a rollback when nothing is live', async () => {
    const reply = await post('/api/app-updates/rollback', {
      platform: 'desktop',
      channel: 'dev',
      reason: 'nothing',
      toEmbedded: false,
    });
    expect(reply.status).toBe(409);
  });

  it('removes only the files no update refers to and refuses a member', async () => {
    const kept = await publishPage('<html>kept</html>');
    const orphan = Buffer.from('orphan');
    await upload(orphan);
    expect((await post('/api/app-updates/prune', undefined, hub.tokenFor('member'))).status).toBe(
      403,
    );
    const reply = await send('POST', '/api/app-updates/prune', { token: hub.tokenFor('owner') });
    expect(APP_UPDATE_PRUNED.parse(await reply.json()).removed).toStrictEqual([sha(orphan)]);
    expect(await readFile(blobFile(hub.layout, kept.files[0]?.sha256 ?? ''))).toBeDefined();
    await expect(
      writeFile(blobFile(hub.layout, sha(orphan)), '', { flag: 'wx' }),
    ).resolves.toBeUndefined();
  });
});
