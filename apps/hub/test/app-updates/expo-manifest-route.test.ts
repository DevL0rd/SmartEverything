import { createHash, generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request as send, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  APP_UPDATE_TARGETED_INDEX_FILE,
  APP_UPDATE_MANIFEST_PATH,
  createClientToken,
  hashClientToken,
  type AppUpdateEntry,
  type AppUpdateFile,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AndroidAppUpdateEntry } from '../../src/app-updates/expo-manifest';
import { expoManifestRoute } from '../../src/app-updates/expo-manifest-route';
import { ManifestSigner } from '../../src/app-updates/manifest-signing';
import { appUpdateKeyOf } from '../../src/app-updates/update-key';
import { AppUpdateFolder } from '../../src/app-updates/update-folder';
import type { HubLayout } from '../../src/data-layout';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { testLayout } from '../support/test-layout';

const NOW = new Date('2026-10-25T10:00:00Z');
const BUNDLE = Buffer.from('hermes bundle');
const ICON = Buffer.from('icon bytes');
const RUNTIME = 'runtime-a';
const MANIFEST = z.object({
  id: z.string(),
  launchAsset: z.object({ hash: z.string(), url: z.string() }),
  assets: z.array(z.object({ url: z.string(), fileExtension: z.string() })),
});

interface Answer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly text: string;
}

let data = '';
let layout: HubLayout;
let test: TestStore;
let server: Server;
let port = 0;
let key = '';
let signer: ManifestSigner;
let served: AppUpdateFolder;
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });

function fileOf(
  path: string,
  bytes: Buffer,
  contentType: string,
  extension?: string,
): AppUpdateFile {
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    contentType,
    ...(extension === undefined ? {} : { fileExtension: extension }),
  };
}

function entry(overrides: Partial<AndroidAppUpdateEntry> = {}): AndroidAppUpdateEntry {
  return {
    id: randomUUID(),
    platform: 'android',
    channel: 'release',
    runtimeVersion: RUNTIME,
    createdAt: '2026-10-25T08:00:00Z',
    appVersion: '1.0.0',
    notes: 'Changed something.',
    launch: fileOf('bundles/index-1.hbc', BUNDLE, 'application/javascript'),
    files: [fileOf('assets/icon', ICON, 'image/png', '.png')],
    expoClient: { name: 'SmartEverything', android: { package: 'com.example.app' } },
    withdrawn: null,
    ...overrides,
  };
}

async function publish(entries: readonly AppUpdateEntry[]): Promise<void> {
  const folder = new AppUpdateFolder(layout);
  await mkdir(folder.directory, { recursive: true });
  await writeFile(
    folder.indexFile,
    JSON.stringify({ entries: entries.filter((item) => item.clientId === undefined) }),
  );
  await writeFile(
    join(folder.directory, APP_UPDATE_TARGETED_INDEX_FILE),
    JSON.stringify({ entries: entries.filter((item) => item.clientId !== undefined) }),
  );
  await served.refresh();
}

async function ask(headers: Record<string, string>): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = send(
      {
        host: '127.0.0.1',
        port,
        path: APP_UPDATE_MANIFEST_PATH,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function expoHeaders(
  extra: Record<string, string> = {},
  sent: string | null = key,
): Record<string, string> {
  return {
    'expo-protocol-version': '1',
    'expo-platform': 'android',
    'expo-runtime-version': RUNTIME,
    'expo-extra-params': sent === null ? 'channel="release"' : `channel="release", key="${sent}"`,
    ...extra,
  };
}

function partOf(answer: Answer): { readonly headers: string; readonly body: string } {
  const boundary = /boundary=(\S+)$/u.exec(String(answer.headers['content-type']))?.[1] ?? '';
  const segment = answer.text.split(`--${boundary}`)[1] ?? '';
  const [headers = '', body = ''] = segment
    .replace(/^\r\n/u, '')
    .replace(/\r\n$/u, '')
    .split('\r\n\r\n');
  return { headers, body };
}

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'hub-expo-route-'));
  layout = await testLayout(data);
  test = await testStore();
  const client = test.store.clients.create({
    name: 'Tablet',
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(createClientToken()),
  });
  key = appUpdateKeyOf(test.store, { kind: 'client', client }).key;
  await mkdir(join(layout.system.updates.appUpdates, 'keys'), { recursive: true });
  await writeFile(
    join(layout.system.updates.appUpdates, 'keys', 'private-key.pem'),
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  signer = await ManifestSigner.start(
    layout.system.updates.appUpdates,
    testLogger('app-updates'),
  );
  await startServer(signer);
});

async function startServer(using: ManifestSigner): Promise<void> {
  served = new AppUpdateFolder(layout);
  const route = expoManifestRoute({
    store: test.store,
    links: new MediaLinks(() => NOW),
    folder: served,
    signer: using,
    log: testLogger('app-updates'),
  });
  server = createServer((request, response) => {
    route.handle(request, response, {}).catch((cause: unknown) => {
      const known = cause instanceof ApiError;
      response.writeHead(known ? cause.status : 500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: known ? cause.message : 'crashed' }));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No test server port.');
  port = address.port;
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await test.close();
  await rm(data, { recursive: true, force: true });
});

describe('the expo manifest route', () => {
  it('only offers a targeted update to the paired device and hides its withdrawal from others', async () => {
    const [clientId = ''] = key.split('.');
    const targeted = entry({ clientId });
    const other = test.store.clients.create({
      name: 'Other Android device',
      platform: 'android',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
    });
    const otherKey = appUpdateKeyOf(test.store, { kind: 'client', client: other }).key;
    await publish([targeted]);
    const selected = partOf(await ask(expoHeaders()));
    expect(MANIFEST.parse(JSON.parse(selected.body)).id).toBe(targeted.id);
    const hidden = partOf(await ask(expoHeaders({}, otherKey)));
    expect(JSON.parse(hidden.body)).toEqual({ type: 'noUpdateAvailable' });
    await publish([
      { ...targeted, withdrawn: { at: NOW.toISOString(), reason: 'Test complete.' } },
    ]);
    const current = { 'expo-current-update-id': targeted.id };
    const rolledBack = partOf(await ask(expoHeaders(current)));
    expect(JSON.parse(rolledBack.body)).toMatchObject({ type: 'rollBackToEmbedded' });
    const otherResponse = partOf(await ask(expoHeaders(current, otherKey)));
    expect(JSON.parse(otherResponse.body)).toEqual({ type: 'noUpdateAvailable' });
  });
  it('hands the update key only to the paired device itself', () => {
    const direct = test.store.clients.byId(key.split('.')[0] ?? '');
    const delegated = [
      { via: 'assistant' },
      { mcpOrigin: 'personal' },
      { pluginId: 'plugin' },
    ] as const;
    for (const extra of delegated) {
      expect(() =>
        appUpdateKeyOf(test.store, { kind: 'client', client: direct, ...extra }),
      ).toThrow(ApiError);
    }
    expect(appUpdateKeyOf(test.store, { kind: 'client', client: direct }).key).toBe(key);
  });
  it('refuses a call with no key, a forged key or the key of a device no longer paired', async () => {
    await publish([entry()]);
    const [clientId = '', mac = ''] = key.split('.');
    const other = test.store.clients.create({
      name: 'Phone',
      platform: 'android',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
    });
    const logs = captureLogs();
    expect((await ask(expoHeaders({}, null))).status).toBe(401);
    expect((await ask(expoHeaders({}, `${clientId}.${'A'.repeat(43)}`))).status).toBe(401);
    expect((await ask(expoHeaders({}, `${other.id}.${mac}`))).status).toBe(401);
    expect((await ask(expoHeaders({}, `${randomUUID()}.${mac}`))).status).toBe(401);
    expect((await ask(expoHeaders())).status).toBe(200);
    expect(JSON.stringify(logs.records)).not.toContain(mac);
  });

  it('gives each device its own key, so one device key never opens another', () => {
    const other = test.store.clients.create({
      name: 'Phone',
      platform: 'android',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
    });
    const otherKey = appUpdateKeyOf(test.store, { kind: 'client', client: other }).key;
    expect(otherKey).not.toBe(key);
    expect(otherKey.startsWith(`${other.id}.`)).toBe(true);
    expect(() => appUpdateKeyOf(test.store, { kind: 'anonymous' })).toThrow(ApiError);
    for (const delegated of [
      { via: 'assistant' },
      { mcpOrigin: 'personal' },
      { pluginId: 'plugin' },
    ] as const) {
      expect(() =>
        appUpdateKeyOf(test.store, { kind: 'client', client: other, ...delegated }),
      ).toThrow(ApiError);
    }
  });

  it('refuses protocol 0 and names the wrong header', async () => {
    const answer = await ask(expoHeaders({ 'expo-protocol-version': '0' }));
    expect(answer.status).toBe(400);
    expect(answer.text).toContain('expo-protocol-version');
  });

  it('serves a signed manifest with absolute signed asset links and base64url hashes', async () => {
    const stored = entry();
    await publish([stored]);
    const logs = captureLogs();
    const answer = await ask(expoHeaders({ 'expo-expect-signature': 'sig, keyid="main"' }));
    expect(answer.status).toBe(200);
    expect(answer.headers).toMatchObject({
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'expo-manifest-filters': '',
      'expo-server-defined-headers': '',
      'cache-control': 'private, max-age=0',
    });
    expect(String(answer.headers['content-type'])).toMatch(/^multipart\/mixed; boundary=/u);
    const part = partOf(answer);
    expect(part.headers).toContain('content-disposition: form-data; name="manifest"');
    const manifest = MANIFEST.parse(JSON.parse(part.body));
    expect(manifest.id).toBe(stored.id);
    expect(manifest.launchAsset.hash).toBe(
      createHash('sha256').update(BUNDLE).digest().toString('base64url'),
    );
    expect(manifest.launchAsset.url).toMatch(
      new RegExp(
        `^http://127\\.0\\.0\\.1:${String(port)}/media/app-updates/[0-9a-f]{64}\\?expires=\\d+&signature=[0-9a-f]+$`,
        'u',
      ),
    );
    expect(manifest.assets[0]?.fileExtension).toBe('.png');
    const signature = /expo-signature: sig="([^"]+)", keyid="main"/u.exec(part.headers)?.[1] ?? '';
    expect(
      verify(
        'sha256',
        Buffer.from(part.body, 'utf8'),
        pair.publicKey,
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true);
    const served = logs.records.filter((record) => record.event === 'app_update.manifest_served');
    expect(served).toHaveLength(1);
    expect(served[0]?.payload).toStrictEqual({
      answer: 'manifest',
      updateId: stored.id,
      channel: 'release',
      runtimeVersion: RUNTIME,
    });
    expect(JSON.stringify(logs.records)).not.toContain(key);
  });

  it('serves unsigned when the client does not expect a signature', async () => {
    await publish([entry()]);
    const answer = await ask(expoHeaders());
    expect(answer.status).toBe(200);
    expect(partOf(answer).headers).not.toContain('expo-signature');
  });

  it('uses the public origin when the request came through the public host', async () => {
    test.store.settings.setPublicUrl('https://home.example');
    await publish([entry()]);
    const answer = await ask({ ...expoHeaders(), host: 'home.example' });
    expect(partOf(answer).body).toContain('"url":"https://home.example/media/app-updates/');
  });

  it('answers noUpdateAvailable when the client runs the latest update', async () => {
    const stored = entry();
    await publish([stored]);
    const answer = await ask(
      expoHeaders({ 'expo-current-update-id': stored.id, 'expo-expect-signature': 'sig' }),
    );
    const part = partOf(answer);
    expect(part.headers).toContain('name="directive"');
    expect(JSON.parse(part.body)).toStrictEqual({ type: 'noUpdateAvailable' });
    expect(part.headers).toContain('expo-signature: sig="');
  });

  it('answers rollBackToEmbedded when the running update was withdrawn and nothing is left', async () => {
    const running = entry({ withdrawn: { at: '2026-10-25T09:30:00Z', reason: 'broken' } });
    await publish([running]);
    const answer = await ask(expoHeaders({ 'expo-current-update-id': running.id }));
    expect(JSON.parse(partOf(answer).body)).toStrictEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-10-25T09:30:00.000Z' },
    });
  });

  it('answers a named error and never an unsigned manifest when the key is missing', async () => {
    await publish([entry()]);
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    const unsigned = await ManifestSigner.start(join(data, 'no-keys'), testLogger('app-updates'));
    await startServer(unsigned);
    const refused = await ask(expoHeaders({ 'expo-expect-signature': 'sig' }));
    expect(refused.status).toBe(500);
    expect(refused.text).toMatch(
      /Signing an app update needs a RSA private key in .*private-key\.pem; received no file/u,
    );
    expect((await ask(expoHeaders())).status).toBe(200);
  });
});
