import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  publishStagedDesktop,
  type DesktopPublicationPorts,
} from '../../src/releases/publish-desktop';
import { releaseStaging, type ReleaseStaging } from '../../src/releases/staging';
import { MachineUpdatePublisher } from '../../src/updates/machine-update-publication';
import { loadRelease, ReleaseFolder } from '../../src/updates/release-folder';
import { testStore, type TestStore } from '../support/store';
import { stageRelease, type StagedInput } from './staged-fixture';

const NOW = new Date('2026-11-14T10:00:00.000Z');

const RUNTIME = 'a'.repeat(32);

let fixture: TestStore;
let staging: ReleaseStaging;

function zip(label: string): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(label)]);
}

function files(arches: readonly string[], version = '0.5.0'): StagedInput['files'] {
  return {
    ...Object.fromEntries(
      arches.map((arch) => [
        `${arch}/SmartEverything-linux-${arch}-${version}.zip`,
        zip(arch + version),
      ]),
    ),
    'runtime-version.txt': `${RUNTIME}\n`,
  };
}

function release(
  arches: readonly string[] = ['x64', 'arm64'],
  version = '0.5.0',
  overrides: Partial<StagedInput> = {},
): StagedInput {
  return {
    artifact: 'desktop',
    target: 'linux-x64',
    facts: { version, arches },
    version,
    files: files(arches, version),
    ...overrides,
  };
}

function ports(): DesktopPublicationPorts {
  return {
    staging,
    publisher: new MachineUpdatePublisher(fixture.layout, new ReleaseFolder(fixture.layout)),
    current: () => loadRelease(fixture.layout.system.updates.machineUpdates),
  };
}

async function request(
  input: StagedInput,
  arches: readonly ('x64' | 'arm64')[] = ['x64', 'arm64'],
): Promise<Awaited<ReturnType<typeof publishStagedDesktop>>> {
  const upload = await stageRelease(fixture.layout, staging, input);
  return publishStagedDesktop(ports(), {
    runId: randomUUID(),
    upload: upload.uploadId,
    notes: 'Faster start.',
    arches,
  });
}

function refusedWith(
  result: Awaited<ReturnType<typeof publishStagedDesktop>>,
  reason: string,
): void {
  expect(result.status).toBe('refused');
  if (result.status === 'refused') expect(result.reason).toContain(reason);
}

beforeEach(async () => {
  fixture = await testStore();
  staging = releaseStaging(
    fixture.layout,
    () => NOW,
    () => Promise.resolve(1e12),
  );
});

afterEach(async () => {
  await fixture.close();
});

describe('a provided desktop release', () => {
  it('publishes the zips and the web runtime notice into the Hub data', async () => {
    const result = await request(release());
    expect(result.status).toBe('published');
    const folder = fixture.layout.system.updates.machineUpdates;
    const manifest = await loadRelease(folder);
    expect(manifest?.version).toBe('0.5.0');
    expect(manifest?.notes).toBe('Faster start.');
    expect(manifest?.artifacts.map((artifact) => `${artifact.arch}:${artifact.kind}`)).toEqual([
      'x64:zip',
      'arm64:zip',
    ]);
    expect((await readdir(folder)).sort()).toEqual([
      'SmartEverything-linux-arm64-0.5.0.zip',
      'SmartEverything-linux-x64-0.5.0.zip',
      'manifest.json',
      'notice.json',
    ]);
    const notice: unknown = JSON.parse(await readFile(join(folder, 'notice.json'), 'utf8'));
    expect(notice).toMatchObject({ version: '0.5.0', runtimeVersion: RUNTIME });
    expect(await staging.list()).toEqual([]);
  });

  it('keeps only the listed architecture', async () => {
    const result = await request(release(['x64']), ['x64']);
    expect(result.status).toBe('published');
    expect(
      (await loadRelease(fixture.layout.system.updates.machineUpdates))?.artifacts,
    ).toHaveLength(1);
  });

  it('refuses a list of architectures that differs from the release', async () => {
    refusedWith(await request(release(['x64', 'arm64']), ['x64']), 'arches_mismatch');
    refusedWith(await request(release(['x64']), ['x64', 'arm64']), 'arches_mismatch');
    expect(await loadRelease(fixture.layout.system.updates.machineUpdates)).toBeNull();
  });

  it('refuses a version that is not newer than the published one and keeps the stage', async () => {
    expect((await request(release(['x64'], '0.5.0'), ['x64'])).status).toBe('published');
    refusedWith(await request(release(['x64'], '0.4.9'), ['x64']), 'version_not_newer');
    expect(await staging.list()).toHaveLength(1);
    const newer = await request(release(['x64'], '0.5.1'), ['x64']);
    expect(newer.status).toBe('published');
  });

  it('answers a release that is already the published one without publishing again', async () => {
    expect((await request(release(['x64']), ['x64'])).status).toBe('published');
    const again = await request(release(['x64']), ['x64']);
    expect(again.status).toBe('published');
    expect(await staging.list()).toEqual([]);
  });

  it('refuses a release version that differs from the desktop version', async () => {
    const input = release(['x64'], '0.5.0', { facts: { version: '0.5.1', arches: ['x64'] } });
    refusedWith(await request(input, ['x64']), 'version_mismatch');
  });

  it('refuses a layout with a missing, doubled or foreign file', async () => {
    refusedWith(
      await request(release(['x64'], '0.5.0', { files: { 'runtime-version.txt': RUNTIME } }), [
        'x64',
      ]),
      'exactly one .zip',
    );
    refusedWith(
      await request(
        release(['x64'], '0.5.0', {
          files: { ...files(['x64']), 'x64/second.zip': zip('2') },
        }),
        ['x64'],
      ),
      'exactly one .zip',
    );
    refusedWith(
      await request(
        release(['x64'], '0.5.0', { files: { ...files(['x64']), 'notes.txt': 'extra' } }),
        ['x64'],
      ),
      'notes.txt',
    );
  });

  it('refuses a zip that is not an archive and a bad runtime version', async () => {
    refusedWith(
      await request(
        release(['x64'], '0.5.0', {
          files: { 'x64/app.zip': 'not a zip', 'runtime-version.txt': RUNTIME },
        }),
        ['x64'],
      ),
      'not a ZIP',
    );
    refusedWith(
      await request(
        release(['x64'], '0.5.0', { files: { ...files(['x64']), 'runtime-version.txt': 'short' } }),
        ['x64'],
      ),
      'runtime',
    );
  });

  it('refuses a ui release and an unknown upload', async () => {
    const wrong = await stageRelease(fixture.layout, staging, {
      artifact: 'ui',
      target: 'desktop',
      facts: { runtimeVersion: 'r' },
      version: '1.0.0',
      files: { 'index.html': 'x' },
    });
    const result = await publishStagedDesktop(ports(), {
      runId: randomUUID(),
      upload: wrong.uploadId,
      notes: 'n',
      arches: ['x64'],
    });
    refusedWith(result, 'wrong_artifact');
    const missing = await publishStagedDesktop(ports(), {
      runId: randomUUID(),
      upload: randomUUID(),
      notes: 'n',
      arches: ['x64'],
    });
    refusedWith(missing, 'upload_missing');
  });
});
