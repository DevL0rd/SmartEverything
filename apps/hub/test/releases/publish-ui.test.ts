import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AndroidAppObservation, PairedAndroidBuild } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readIndex } from '../../src/app-updates/store';
import { publishStagedUi, type UiPublicationPorts } from '../../src/releases/publish-ui';
import { releaseStaging, type ReleaseStaging } from '../../src/releases/staging';
import { testStore, type TestStore } from '../support/store';
import { hermesBundle, stageRelease, type StagedInput } from './staged-fixture';

const NOW = new Date('2026-11-14T10:00:00.000Z');

const PACKAGE = 'com.example.app';

const RUNTIME = 'runtime-1';

const CLIENT = randomUUID();

let fixture: TestStore;
let staging: ReleaseStaging;
let paired: PairedAndroidBuild[];
let moment: Date;

function observation(overrides: Partial<AndroidAppObservation> = {}): PairedAndroidBuild {
  return {
    clientId: CLIENT,
    observation: {
      applicationId: PACKAGE,
      versionCode: '10',
      runtimeVersion: RUNTIME,
      channel: 'release',
      currentUpdateId: null,
      observedAt: NOW.toISOString(),
      lastOutcome: null,
      ...overrides,
    },
  };
}

function ports(): UiPublicationPorts {
  return {
    layout: fixture.layout,
    staging,
    now: () => moment,
    paired: () => paired,
  };
}

function androidFiles(extra: Record<string, string | Buffer> = {}): StagedInput['files'] {
  return {
    'metadata.json': JSON.stringify({
      fileMetadata: {
        android: {
          bundle: '_expo/static/js/android/entry.hbc',
          assets: [{ path: 'assets/abc123', ext: 'png' }],
        },
      },
    }),
    '_expo/static/js/android/entry.hbc': hermesBundle(),
    'assets/abc123': 'png-bytes',
    'expo-client.json': JSON.stringify({ android: { package: PACKAGE }, name: 'app' }),
    ...extra,
  };
}

function android(files: StagedInput['files'] = androidFiles(), version = '2.0.0'): StagedInput {
  return {
    artifact: 'ui',
    target: 'android',
    facts: { runtimeVersion: RUNTIME },
    version,
    files,
  };
}

function desktop(
  files: StagedInput['files'] = { 'index.html': '<html></html>', 'a.js': 'x' },
): StagedInput {
  return {
    artifact: 'ui',
    target: 'desktop',
    facts: { runtimeVersion: 'desktop-runtime' },
    version: '2.0.0',
    files,
  };
}

async function request(
  input: StagedInput,
  options: { channel?: 'release' | 'dev'; clientId?: string; runId?: string } = {},
): Promise<Awaited<ReturnType<typeof publishStagedUi>>> {
  const upload = await stageRelease(fixture.layout, staging, input);
  return publishStagedUi(ports(), {
    runId: options.runId ?? randomUUID(),
    upload: upload.uploadId,
    notes: 'Fixes a thing.',
    channel: options.channel ?? 'release',
    clientId: options.clientId,
  });
}

function refusedWith(result: Awaited<ReturnType<typeof publishStagedUi>>, reason: string): void {
  expect(result.status).toBe('refused');
  if (result.status === 'refused') expect(result.reason).toContain(reason);
}

beforeEach(async () => {
  fixture = await testStore();
  moment = NOW;
  staging = releaseStaging(
    fixture.layout,
    () => NOW,
    () => Promise.resolve(1e12),
  );
  paired = [observation()];
});

afterEach(async () => {
  await fixture.close();
});

describe('a provided android ui release', () => {
  it('publishes the exported bundle and its assets from the stage into the Hub data', async () => {
    const result = await request(android());
    expect(result.status).toBe('published');
    const index = await readIndex(fixture.layout);
    const [entry] = index.entries;
    expect(index.entries).toHaveLength(1);
    expect(entry).toMatchObject({
      platform: 'android',
      runtimeVersion: RUNTIME,
      appVersion: '2.0.0',
    });
    expect(entry?.clientId).toBeUndefined();
    expect(entry?.launch?.path).toBe('_expo/static/js/android/entry.hbc');
    expect(entry?.files).toHaveLength(1);
    expect(entry?.files[0]).toMatchObject({ path: 'assets/abc123', fileExtension: '.png' });
    const blob = join(
      fixture.layout.system.updates.appUpdates,
      'blobs',
      entry?.launch?.sha256 ?? '',
    );
    await expect(access(blob)).resolves.toBeUndefined();
  });

  it('removes the stage once published', async () => {
    await request(android());
    expect(await staging.list()).toEqual([]);
  });

  it('answers a repeated request with the same published entry', async () => {
    const runId = randomUUID();
    const upload = await stageRelease(fixture.layout, staging, android());
    const first = await publishStagedUi(ports(), {
      runId,
      upload: upload.uploadId,
      notes: 'n',
      channel: 'release',
    });
    const again = await publishStagedUi(ports(), {
      runId,
      upload: upload.uploadId,
      notes: 'n',
      channel: 'release',
    });
    expect(again).toMatchObject({ status: 'published', runId });
    expect(first.status).toBe('published');
    expect((await readIndex(fixture.layout)).entries).toHaveLength(1);
  });

  it('limits the offer to one device with clientId', async () => {
    const result = await request(android(), { clientId: CLIENT });
    expect(result).toMatchObject({ status: 'published', entry: { clientId: CLIENT } });
    const [entry] = (await readIndex(fixture.layout)).entries;
    expect(entry?.clientId).toBe(CLIENT);
  });

  it('refuses when no paired device of the app is on the channel', async () => {
    paired = [observation({ channel: 'dev' })];
    refusedWith(await request(android()), 'missing_target');
    paired = [observation({ applicationId: 'com.other.app' })];
    refusedWith(await request(android()), 'missing_target');
    paired = [];
    refusedWith(await request(android()), 'missing_target');
  });

  it('refuses a device that is not the requested one', async () => {
    refusedWith(await request(android(), { clientId: randomUUID() }), 'missing_target');
  });

  it('refuses a runtime version no observed device runs', async () => {
    paired = [observation({ runtimeVersion: 'runtime-0' })];
    refusedWith(await request(android()), 'runtime_mismatch');
    expect((await readIndex(fixture.layout)).entries).toEqual([]);
  });

  it('requires a device for the dev channel', async () => {
    paired = [observation({ channel: 'dev' })];
    refusedWith(await request(android(), { channel: 'dev' }), 'test_requires_device');
    const result = await request(android(), { channel: 'dev', clientId: CLIENT });
    expect(result.status).toBe('published');
  });

  it('refuses content the Hub already offers and keeps the stage', async () => {
    expect((await request(android())).status).toBe('published');
    const result = await request(android());
    refusedWith(result, 'already offered');
    expect(await staging.list()).toHaveLength(1);
  });

  it('refuses a bundle that is not Hermes bytecode', async () => {
    const files = androidFiles({ '_expo/static/js/android/entry.hbc': 'plain javascript' });
    refusedWith(await request(android(files)), 'Hermes');
  });

  it('refuses an export without the Android package in its config', async () => {
    const files = androidFiles({ 'expo-client.json': JSON.stringify({ name: 'app' }) });
    refusedWith(await request(android(files)), 'android.package');
  });

  it('refuses an export whose metadata names a file the release does not list', async () => {
    const files = androidFiles({
      'metadata.json': JSON.stringify({
        fileMetadata: {
          android: {
            bundle: '_expo/static/js/android/entry.hbc',
            assets: [{ path: 'assets/nope', ext: 'png' }],
          },
        },
      }),
    });
    refusedWith(await request(android(files)), 'file_not_listed');
  });

  it('refuses an asset type it has no content type for', async () => {
    const files = androidFiles({
      'metadata.json': JSON.stringify({
        fileMetadata: {
          android: {
            bundle: '_expo/static/js/android/entry.hbc',
            assets: [{ path: 'assets/abc123', ext: 'xyz' }],
          },
        },
      }),
    });
    refusedWith(await request(android(files)), 'no content type');
  });

  it('refuses a file changed on disk after the release was verified', async () => {
    const upload = await stageRelease(fixture.layout, staging, android());
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(staging.releaseDirectory(upload), 'files', 'assets', 'abc123'),
      'tampered-bytes',
    );
    const result = await publishStagedUi(ports(), {
      runId: randomUUID(),
      upload: upload.uploadId,
      notes: 'n',
      channel: 'release',
    });
    refusedWith(result, 'file_changed');
    expect((await readIndex(fixture.layout)).entries).toEqual([]);
  });

  it('refuses an upload that does not exist, is not staged or holds another artifact', async () => {
    const missing = await publishStagedUi(ports(), {
      runId: randomUUID(),
      upload: randomUUID(),
      notes: 'n',
      channel: 'release',
    });
    refusedWith(missing, 'upload_missing');
    const receiving = await staging.begin({ artifact: 'ui', size: 5, sha256: 'a'.repeat(64) });
    const notStaged = await publishStagedUi(ports(), {
      runId: randomUUID(),
      upload: receiving.uploadId,
      notes: 'n',
      channel: 'release',
    });
    refusedWith(notStaged, 'not_staged');
    const desktopRelease = await stageRelease(fixture.layout, staging, {
      artifact: 'desktop',
      target: 'linux-x64',
      facts: { version: '1.0.0', arches: ['x64'] },
      version: '1.0.0',
      files: { 'x64/app.zip': 'zip' },
    });
    const wrong = await publishStagedUi(ports(), {
      runId: randomUUID(),
      upload: desktopRelease.uploadId,
      notes: 'n',
      channel: 'release',
    });
    refusedWith(wrong, 'wrong_artifact');
  });
});

describe('a provided desktop ui release', () => {
  it('publishes the web export with its runtime version', async () => {
    const result = await request(desktop());
    expect(result).toMatchObject({ status: 'published', platform: 'desktop' });
    const [entry] = (await readIndex(fixture.layout)).entries;
    expect(entry).toMatchObject({
      platform: 'desktop',
      runtimeVersion: 'desktop-runtime',
      launch: null,
      expoClient: null,
    });
    expect(entry?.files.map((file) => file.path)).toEqual(['a.js', 'index.html']);
    expect(entry?.files[1]?.contentType).toBe('text/html');
  });

  it('needs no paired Android device', async () => {
    paired = [];
    expect((await request(desktop())).status).toBe('published');
  });

  it('refuses an export without a nonempty index.html', async () => {
    refusedWith(await request(desktop({ 'a.js': 'x' })), 'index.html');
    refusedWith(await request(desktop({ 'index.html': '' })), 'index.html');
  });

  it('refuses the reserved bundle.json', async () => {
    refusedWith(await request(desktop({ 'index.html': 'x', 'bundle.json': '{}' })), 'bundle.json');
  });

  it('refuses a device limit', async () => {
    refusedWith(await request(desktop(), { clientId: CLIENT }), 'client_not_applicable');
  });
});
