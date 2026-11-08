import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishMachineUpdate } from '../release-machine-update.ts';
import {
  PUBLICATION,
  built,
  useReleaseWorkspace,
  useReleaseHub,
  releaseHub,
  workspace,
} from './release-machine-update-fixture.ts';

useReleaseWorkspace();
useReleaseHub();

function expectNoReleaseFiles(): void {
  const directory = releaseHub().hub.layout.system.updates.machineUpdates;
  expect(existsSync(directory)).toBe(false);
  expect(existsSync(`${directory}.next`)).toBe(false);
}

describe('publishing platform desktop archives', () => {
  it('refuses blank notes before staging a desktop release', async () => {
    const path = await built('desktop-0.4.2.zip', '0.4.2');
    const files = [{ platform: 'linux', arch: 'x64', kind: 'zip', path }];
    await expect(
      publishMachineUpdate(releaseHub().target, '0.4.2', files, { notes: ' \n ' }),
    ).rejects.toThrow();
    expectNoReleaseFiles();
  });

  it('stores nothing when a windows release lacks its RELEASES file', async () => {
    const nupkg = await built('smarteverything-0.4.2-full.nupkg', '0.4.2', { platform: 'win32' });
    await expect(
      publishMachineUpdate(
        releaseHub().target,
        '0.4.2',
        [{ platform: 'win32', arch: 'x64', kind: 'nupkg', path: nupkg }],
        PUBLICATION,
      ),
    ).rejects.toThrow('one nupkg and one RELEASES file for win32');
    expectNoReleaseFiles();
  });

  it('publishes a canonical Squirrel nupkg and its RELEASES file', async () => {
    const name = 'smarteverything-0.4.2-full.nupkg';
    const nupkg = await built(name, '0.4.2', { platform: 'win32' });
    const releases = join(workspace.base, 'out', 'RELEASES');
    const bytes = await readFile(nupkg);
    const hash = createHash('sha1').update(bytes).digest('hex').toUpperCase();
    await writeFile(releases, `${hash} ${name} ${String(bytes.length)}\n`);
    const target = { platform: 'win32', arch: 'x64' };

    const manifest = await publishMachineUpdate(
      releaseHub().target,
      '0.4.2',
      [
        { ...target, kind: 'nupkg', path: nupkg },
        { ...target, kind: 'releases', path: releases },
      ],
      PUBLICATION,
    );

    expect(manifest.artifacts.map((artifact) => artifact.file)).toEqual([name, 'RELEASES']);
  });

  it('publishes a macOS ZIP with one app bundle and Finder metadata', async () => {
    const path = await built('desktop-darwin.zip', '0.4.2', {
      platform: 'darwin',
      extra: ['__MACOSX/._SmartEverything.app'],
    });
    const manifest = await publishMachineUpdate(
      releaseHub().target,
      '0.4.2',
      [{ platform: 'darwin', arch: 'arm64', kind: 'zip', path }],
      PUBLICATION,
    );
    expect(manifest.artifacts[0]?.file).toBe('desktop-darwin.zip');
  });

  it.each([
    { platform: 'darwin', kind: 'zip', entry: 'SmartEverything.app/Contents/resources/app.asar' },
    { platform: 'win32', kind: 'nupkg', entry: 'lib/net45/resources/APP.ASAR' },
  ] as const)('rejects a case-colliding ASAR in a $platform archive', async (fixture) => {
    const path = await built(`desktop.${fixture.kind}`, '0.4.2', {
      platform: fixture.platform,
      extra: [fixture.entry],
    });
    await expect(
      publishMachineUpdate(
        releaseHub().target,
        '0.4.2',
        [{ platform: fixture.platform, arch: 'x64', kind: fixture.kind, path }],
        PUBLICATION,
      ),
    ).rejects.toThrow('a canonical layout');
    expectNoReleaseFiles();
  });
});
