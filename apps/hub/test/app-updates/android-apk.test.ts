import {
  ANDROID_APK_ABIS,
  ANDROID_APK_RELEASE,
  ApiError,
  matchPath,
  type AndroidApkBaseline,
  type AndroidApkRelease,
  type ClientRow,
} from '@smarteverything/domain';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AndroidApkFolder } from '../../src/app-updates/android-apk-folder';
import { androidApkDownload, androidApkOffer } from '../../src/app-updates/android-apk-route';
import { watchAndroidApks } from '../../src/app-updates/android-apk-watch';
import { MediaLinks } from '../../src/server/media-links';
import { testLogger } from '../support/logs';
import { testLayout } from '../support/test-layout';

const NOW = new Date('2026-11-05T10:00:00Z');
const APP_ID = 'com.devl0rd.smarteverything.dev';
const BYTES = 'signed apk fixture';
const CLIENT: ClientRow = {
  id: '9474ecc2-4b5d-4206-9447-7420447b4ab1',
  name: 'Phone',
  platform: 'android',
  kind: 'phone',
  role: 'member',
  built_in: false,
  profile_id: null,
  created_at: NOW.toISOString(),
  last_seen_at: null,
};
const RELEASE: AndroidApkRelease = {
  id: '961c58b2-c7f7-4c66-9678-2cded842f05a',
  clientId: null,
  channel: 'release',
  build: { applicationId: APP_ID, versionCode: '4' },
  runtimeVersion: 'new-native-runtime',
  abis: [...ANDROID_APK_ABIS],
  sha256: 'a'.repeat(64),
  createdAt: NOW.toISOString(),
  appVersion: '0.1.0',
  notes: 'Native app update',
  size: BYTES.length,
};
const QUERY = { applicationId: APP_ID, versionCode: '3', channel: 'release' };
const log = testLogger('app-updates');

let data: string;
let folder: AndroidApkFolder;
const links = new MediaLinks(() => NOW);

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'apk-offer-'));
  folder = new AndroidApkFolder(await testLayout(data));
});

afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

async function store(release: AndroidApkRelease): Promise<void> {
  const directory = folder.directoryFor(release.channel, release.clientId);
  await mkdir(directory, { recursive: true });
  await writeFile(folder.fileOf(release), BYTES);
  const { entries } = await folder.indexFor(release.channel, release.clientId);
  await writeFile(
    folder.indexPath(release.channel, release.clientId),
    JSON.stringify({ entries: [...entries, release] }),
  );
}

function input(
  query: Record<string, unknown>,
): Parameters<ReturnType<typeof androidApkOffer>['run']>[1] {
  return { params: {}, query, body: undefined, remote: '', headers: {} };
}

describe('an Android installer release', () => {
  it('keeps a registered APK baseline out of installer offers and scoped to its paired build', async () => {
    const baseline: AndroidApkBaseline = {
      clientId: CLIENT.id,
      channel: RELEASE.channel,
      build: RELEASE.build,
      runtimeVersion: RELEASE.runtimeVersion,
      sha256: RELEASE.sha256,
      size: RELEASE.size,
    };
    const observed = {
      ...baseline.build,
      runtimeVersion: baseline.runtimeVersion,
      channel: baseline.channel,
      currentUpdateId: null,
      observedAt: NOW.toISOString(),
      lastOutcome: null,
    };
    await mkdir(folder.directoryFor(baseline.channel, baseline.clientId), { recursive: true });
    await writeFile(folder.fileOf(baseline), BYTES);
    await writeFile(
      folder.baselinePath(baseline.channel, baseline.clientId, baseline.build.versionCode),
      JSON.stringify(baseline),
    );
    await expect(folder.baselineFor(CLIENT.id, observed)).resolves.toEqual(baseline);
    await expect(folder.baselineFor(RELEASE.id, observed)).resolves.toBeNull();
    await expect(
      folder.baselineFor(CLIENT.id, { ...observed, channel: 'dev' }),
    ).resolves.toBeNull();
    await expect(
      folder.baselineFor(CLIENT.id, { ...observed, runtimeVersion: 'wrong' }),
    ).rejects.toMatchObject({ code: 'internal' });
    await expect(
      androidApkOffer(links, folder).run({ kind: 'client', client: CLIENT }, input(QUERY), log),
    ).resolves.toBeNull();
  });

  it('offers the same release to different paired Android apps, only when newer', async () => {
    await store(RELEASE);
    const route = androidApkOffer(links, folder);
    const second = { ...CLIENT, id: RELEASE.id };
    for (const client of [CLIENT, second]) {
      await expect(route.run({ kind: 'client', client }, input(QUERY), log)).resolves.toMatchObject(
        {
          release: { id: RELEASE.id },
        },
      );
    }
    await expect(
      route.run({ kind: 'client', client: CLIENT }, input({ ...QUERY, versionCode: '4' }), log),
    ).resolves.toBeNull();
    await expect(
      route.run(
        { kind: 'client', client: CLIENT },
        input({ ...QUERY, applicationId: 'com.other.app' }),
        log,
      ),
    ).resolves.toBeNull();
  });

  it.each(['release', 'dev'] as const)(
    'keeps a scoped %s installer private to its pairing',
    async (channel) => {
      await store({ ...RELEASE, clientId: CLIENT.id, channel, abis: ['x86_64'] });
      const route = androidApkOffer(links, folder);
      const query = input({ ...QUERY, channel });
      await expect(
        route.run({ kind: 'client', client: CLIENT }, query, log),
      ).resolves.toMatchObject({
        release: { id: RELEASE.id },
      });
      await expect(
        route.run({ kind: 'client', client: { ...CLIENT, id: RELEASE.id } }, query, log),
      ).resolves.toBeNull();
      await expect(
        route.run({ kind: 'client', client: CLIENT, via: 'assistant' }, query, log),
      ).rejects.toMatchObject({ code: 'forbidden' });
      expect(ANDROID_APK_RELEASE.safeParse({ ...RELEASE, abis: ['arm64-v8a'] }).success).toBe(
        false,
      );
      expect(ANDROID_APK_RELEASE.safeParse({ ...RELEASE, clientId: CLIENT.id }).success).toBe(true);
    },
  );

  it('offers a newer scoped installer to its pairing and the shared installer to other devices', async () => {
    const scoped = {
      ...RELEASE,
      id: CLIENT.id,
      clientId: CLIENT.id,
      build: { ...RELEASE.build, versionCode: '5' },
    };
    await store(RELEASE);
    await store(scoped);
    const route = androidApkOffer(links, folder);
    await expect(
      route.run({ kind: 'client', client: CLIENT }, input(QUERY), log),
    ).resolves.toMatchObject({
      release: { id: scoped.id },
    });
    await expect(
      route.run({ kind: 'client', client: { ...CLIENT, id: RELEASE.id } }, input(QUERY), log),
    ).resolves.toMatchObject({ release: { id: RELEASE.id } });
  });

  it('streams signed ranges and rejects replaced or unsigned links', async () => {
    await store(RELEASE);
    const route = androidApkDownload(links, folder);
    const server = createServer((request, response) => {
      const params = matchPath(route.path, new URL(request.url ?? '/', 'http://hub').pathname);
      route.handle(request, response, params ?? {}).catch((cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('No test server port.');
      const base = `http://127.0.0.1:${String(address.port)}`;
      const link = links.androidApk('release', 'shared', RELEASE.id).url;
      const response = await fetch(`${base}${link}`, { headers: { range: 'bytes=0-5' } });
      expect(response.status).toBe(206);
      expect(response.headers.get('content-type')).toBe('application/vnd.android.package-archive');
      expect(await response.text()).toBe(BYTES.slice(0, 6));
      expect((await fetch(`${base}${new URL(link, base).pathname}`)).status).toBe(401);
      await store({ ...RELEASE, id: CLIENT.id });
      expect((await fetch(`${base}${link}`)).status).toBe(404);
      expect(await folder.publicationFor('release', null, RELEASE.id)).toEqual(RELEASE);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  it('announces shared installers to everyone and scoped installers only to their pairing', async () => {
    const announce = vi.fn();
    const toClient = vi.fn();
    const stop = await watchAndroidApks(folder, { announce, toClient }, log);
    try {
      await store(RELEASE);
      await store({ ...RELEASE, id: CLIENT.id, clientId: CLIENT.id });
      await vi.waitFor(() => {
        expect(announce).toHaveBeenCalledOnce();
        expect(toClient).toHaveBeenCalledOnce();
      });
      expect(announce).toHaveBeenCalledWith(
        {
          type: 'app_update',
          platform: 'android',
          channel: 'release',
          id: RELEASE.id,
          runtimeVersion: RELEASE.runtimeVersion,
        },
        'everyone',
      );
      expect(toClient).toHaveBeenCalledWith(CLIENT.id, {
        type: 'app_update',
        platform: 'android',
        channel: 'release',
        id: CLIENT.id,
        runtimeVersion: RELEASE.runtimeVersion,
      });
    } finally {
      await stop();
    }
  });
});
