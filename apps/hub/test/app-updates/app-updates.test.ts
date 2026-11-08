import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_UPDATE_ENTRY,
  APP_UPDATE_OFFER,
  ApiError,
  API_ENDPOINTS,
  matchPath,
  type AppUpdateEntry,
  type AppUpdateFile,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppUpdates } from '../../src/app-updates/app-updates';
import type { HubLayout } from '../../src/data-layout';
import { appUpdateBlobRoute } from '../../src/app-updates/extension';
import { AppUpdateIndexInvalidError } from '../../src/app-updates/index-file';
import { AppUpdateFolder } from '../../src/app-updates/update-folder';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { testLayout } from '../support/test-layout';

const NOW = new Date('2026-10-25T10:00:00Z');
const BUNDLE = Buffer.from('desktop web bundle bytes');
const ASSET = Buffer.from('<html>desktop index</html>');

function hashOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileOf(path: string, bytes: Buffer, contentType: string): AppUpdateFile {
  return { path, sha256: hashOf(bytes), size: bytes.length, contentType };
}

const ANDROID_CLIENT = { android: { package: 'com.example.app' } } as const;

function entry(overrides: Partial<AppUpdateEntry>): AppUpdateEntry {
  return APP_UPDATE_ENTRY.parse({
    id: randomUUID(),
    platform: 'desktop',
    channel: 'release',
    runtimeVersion: 'runtime-a',
    createdAt: '2026-10-25T08:00:00Z',
    appVersion: '1.0.0',
    notes: 'Something changed.',
    launch: null,
    files: [fileOf('app.js', BUNDLE, 'application/javascript')],
    expoClient: overrides.platform === 'android' ? ANDROID_CLIENT : null,
    withdrawn: null,
    ...overrides,
  });
}

const TARGET = { platform: 'desktop', channel: 'release', runtimeVersion: 'runtime-a' } as const;

let data = '';
let layout: HubLayout;
let links = new MediaLinks(() => NOW);

function folder(): AppUpdateFolder {
  return new AppUpdateFolder(layout);
}

function updates(): AppUpdates {
  return new AppUpdates(folder(), links, testLogger('app-updates'));
}

async function store(entries: readonly AppUpdateEntry[]): Promise<void> {
  await mkdir(join(folder().directory, 'blobs'), { recursive: true });
  await writeFile(join(folder().directory, 'blobs', hashOf(BUNDLE)), BUNDLE);
  await writeFile(
    folder().indexFile,
    JSON.stringify({ entries: entries.filter((item) => item.clientId === undefined) }),
  );
  await writeFile(
    folder().targetedIndexFile,
    JSON.stringify({ entries: entries.filter((item) => item.clientId !== undefined) }),
  );
}

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'hub-app-updates-'));
  layout = await testLayout(data);
  links = new MediaLinks(() => NOW);
});

afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

describe('offering an app update', () => {
  it('offers nothing while no update was published', async () => {
    expect(await updates().offer(TARGET)).toStrictEqual({
      compatible: null,
      newerIncompatible: null,
      rollBackToEmbedded: false,
    });
    expect(await updates().list()).toStrictEqual([]);
  });

  it('answers a bad index with the named error instead of an empty list', async () => {
    await mkdir(folder().directory, { recursive: true });
    await writeFile(join(folder().directory, 'index.json'), '{"entries": 4}');
    const failure = await updates()
      .offer(TARGET)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(AppUpdateIndexInvalidError);
    expect(String(failure)).toMatch(
      /index\.json must hold an index of app update entries; received/u,
    );
    await writeFile(join(folder().directory, 'index.json'), '{nope');
    await expect(updates().list()).rejects.toThrow(/must hold JSON; received/u);
  });

  it('never offers a withdrawn update', async () => {
    const older = entry({ createdAt: '2026-10-25T07:00:00Z' });
    const withdrawn = entry({
      createdAt: '2026-10-25T09:00:00Z',
      withdrawn: { at: '2026-10-25T09:30:00Z', reason: 'broken' },
    });
    await store([older, withdrawn]);
    const offer = await updates().offer(TARGET);
    expect(offer.compatible?.id).toBe(older.id);
  });

  it('does not offer a targeted update, runtime mismatch, or rollback to another client', async () => {
    const clientId = randomUUID();
    const other = randomUUID();
    const global = entry({ createdAt: '2026-10-25T07:00:00Z' });
    const targeted = entry({ clientId, createdAt: '2026-10-25T09:00:00Z' });
    const incompatible = entry({
      clientId,
      runtimeVersion: 'r2',
      createdAt: '2026-10-25T10:00:00Z',
    });
    await store([global, targeted, incompatible]);
    expect((await updates().offer(TARGET, clientId)).compatible?.id).toBe(targeted.id);
    expect(await updates().offer(TARGET, other)).toMatchObject({
      compatible: { id: global.id },
      newerIncompatible: null,
    });
    await store([{ ...targeted, withdrawn: { at: '2026-10-25T11:00:00Z', reason: 'broken' } }]);
    expect(
      (await updates().offer({ ...TARGET, currentId: targeted.id }, clientId)).rollBackToEmbedded,
    ).toBe(true);
    expect(
      (await updates().offer({ ...TARGET, currentId: targeted.id }, other)).rollBackToEmbedded,
    ).toBe(false);
  });

  it('points to a newer update that needs another runtime', async () => {
    const compatible = entry({});
    const newer = entry({ runtimeVersion: 'runtime-b', createdAt: '2026-10-25T09:00:00Z' });
    await store([compatible, newer]);
    const offer = await updates().offer(TARGET);
    expect(offer.compatible?.id).toBe(compatible.id);
    expect(offer.newerIncompatible?.id).toBe(newer.id);
  });

  it('never treats a different Android OTA runtime as evidence of an installer update', async () => {
    const launch = fileOf('bundle.hbc', BUNDLE, 'application/javascript');
    const android: Partial<AppUpdateEntry> = { platform: 'android', launch, files: [] };
    const compatible = entry(android);
    const incompatible = entry({
      ...android,
      runtimeVersion: 'runtime-b',
      createdAt: '2026-10-25T09:00:00Z',
    });
    const target = {
      ...TARGET,
      platform: 'android',
      applicationId: 'com.example.app',
      versionCode: '29899442',
    } as const;
    await store([incompatible]);
    expect(await updates().offer(target)).toStrictEqual({
      compatible: null,
      newerIncompatible: null,
      rollBackToEmbedded: false,
    });
    await store([compatible, incompatible]);
    expect(await updates().offer(target)).toMatchObject({
      compatible: { id: compatible.id },
      newerIncompatible: null,
    });
  });

  it('asks to roll back when the running update was withdrawn and none is left', async () => {
    const running = entry({ withdrawn: { at: '2026-10-25T09:30:00Z', reason: 'broken' } });
    await store([running]);
    const offer = await updates().offer({ ...TARGET, currentId: running.id });
    expect(offer.rollBackToEmbedded).toBe(true);
    expect(offer.compatible).toBeNull();
  });

  it('gives desktop files signed links that verify and name the stored file', async () => {
    const stored = entry({
      files: [
        fileOf('app.js', BUNDLE, 'application/javascript'),
        fileOf('index.html', ASSET, 'text/html'),
      ],
    });
    await store([stored]);
    const offer = APP_UPDATE_OFFER.parse(await updates().offer(TARGET));
    expect(offer.compatible?.size).toBe(BUNDLE.length + ASSET.length);
    const urls = offer.compatible?.files.map((file) => file.url) ?? [];
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(() => {
        links.verify(new URL(url, 'http://hub'));
      }).not.toThrow();
    }
    expect(urls[0]).toMatch(
      new RegExp(`^/media/app-updates/${hashOf(BUNDLE)}\\?expires=\\d+&signature=[0-9a-f]+$`, 'u'),
    );
  });

  it('lists every entry with its platform, channel, runtime and withdrawal', async () => {
    const withdrawn = entry({ withdrawn: { at: '2026-10-25T09:30:00Z', reason: 'broken' } });
    await store([withdrawn]);
    const [listed] = await updates().list();
    expect(listed).toMatchObject({
      id: withdrawn.id,
      platform: 'desktop',
      channel: 'release',
      runtimeVersion: 'runtime-a',
      size: BUNDLE.length,
      withdrawn: { reason: 'broken' },
    });
  });
});

describe('reporting an outcome', () => {
  let test: TestStore;

  beforeEach(async () => {
    test = await testStore();
  });

  afterEach(async () => {
    await test.close();
  });

  it('logs the outcome once with the client id and the platform of the caller', () => {
    const logs = captureLogs();
    const client = test.store.clients.create({
      name: 'Tablet',
      platform: 'android',
      role: 'member',
      tokenHash: 'b'.repeat(64),
    });
    const updateId = randomUUID();
    updates().report(client, {
      updateId,
      outcome: 'rolled_back',
      reason: 'crashed before content',
    });
    const outcomes = logs.records.filter((record) => record.event === 'app_update.outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.payload).toMatchObject({
      clientId: client.id,
      platform: 'android',
      updateId,
      outcome: 'rolled_back',
      reason: 'crashed before content',
    });
    expect(outcomes[0]?.scope).toBe('hub.app-updates');
  });
});

describe('the stored files', () => {
  it('refuses a malformed hash before any file access', async () => {
    for (const hash of ['../index.json', 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(63)}/`]) {
      expect(() => folder().blobPath(hash)).toThrow(ApiError);
      await expect(folder().blobFor(hash)).rejects.toMatchObject({ code: 'invalid_request' });
    }
  });

  it('refuses a well formed hash no entry names without touching the blob folder', async () => {
    await store([entry({})]);
    await expect(folder().blobFor('c'.repeat(64))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('names a blob that is missing or has another size than the index', async () => {
    await store([entry({})]);
    await writeFile(join(folder().directory, 'blobs', hashOf(BUNDLE)), 'short');
    await expect(folder().blobFor(hashOf(BUNDLE))).rejects.toThrow(/bytes as the index says/u);
    await rm(join(folder().directory, 'blobs', hashOf(BUNDLE)));
    await expect(folder().blobFor(hashOf(BUNDLE))).rejects.toThrow(AppUpdateIndexInvalidError);
  });

  it('finds the launch bundle of an android entry', async () => {
    const launch = fileOf('bundle.hbc', BUNDLE, 'application/javascript');
    await store([entry({ platform: 'android', launch, files: [] })]);
    expect(await folder().blobFor(launch.sha256)).toMatchObject({
      size: BUNDLE.length,
      contentType: 'application/javascript',
    });
  });
});

describe('downloading a stored file over HTTP', () => {
  let server: Server;
  let base = '';

  beforeEach(async () => {
    await store([entry({})]);
    const route = appUpdateBlobRoute(links, folder());
    server = createServer((request, response) => {
      const params = matchPath(route.path, new URL(request.url ?? '/', 'http://hub').pathname);
      route.handle(request, response, params ?? {}).catch((cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No test server port.');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('streams the bytes with the entry content type and a year long cache', async () => {
    const response = await fetch(`${base}${links.appUpdateBlob(hashOf(BUNDLE)).url}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/javascript');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(Buffer.from(await response.arrayBuffer())).toStrictEqual(BUNDLE);
  });

  it('refuses a signed request that carries no file hash instead of looking up an empty one', async () => {
    const route = appUpdateBlobRoute(links, folder());
    const bare = createServer((request, response) => {
      route.handle(request, response, {}).catch((cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
      });
    });
    await new Promise<void>((resolve) => {
      bare.listen(0, '127.0.0.1', resolve);
    });
    const address = bare.address();
    if (address === null || typeof address === 'string') throw new Error('No test server port.');
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}${links.appUpdateBlob(hashOf(BUNDLE)).url}`,
    );
    await new Promise<void>((resolve) => {
      bare.close(() => {
        resolve();
      });
    });
    expect(response.status).toBe(400);
  });

  it('serves a byte range', async () => {
    const response = await fetch(`${base}${links.appUpdateBlob(hashOf(BUNDLE)).url}`, {
      headers: { range: 'bytes=2-5' },
    });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(BUNDLE.subarray(2, 6).toString());
  });

  it('refuses an unsigned or forged link and a malformed hash', async () => {
    const path = `/media/app-updates/${hashOf(BUNDLE)}`;
    expect((await fetch(`${base}${path}`)).status).toBe(401);
    const forged = links
      .appUpdateBlob(hashOf(BUNDLE))
      .url.replace(/signature=[0-9a-f]/u, (prefix): string =>
        prefix === 'signature=0' ? 'signature=1' : 'signature=0',
      );
    expect((await fetch(`${base}${forged}`)).status).toBe(401);
    const bad = links.appUpdateBlob('..%2Findex.json').url;
    expect((await fetch(`${base}${bad}`)).status).toBe(400);
  });

  it('describes the endpoints with their audience', () => {
    expect(API_ENDPOINTS.readAppUpdate.access).toBe('member');
    expect(API_ENDPOINTS.listAppUpdates.access).toBe('owner');
    expect(API_ENDPOINTS.reportAppUpdate.access).toBe('member');
    expect(API_ENDPOINTS.readAppUpdateKey.access).toBe('member');
  });
});
