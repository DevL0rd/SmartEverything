import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MACHINE_UPDATE_MANIFEST } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ReleaseFileArgumentError,
  publishMachineUpdate,
  releaseFileOf,
} from '../release-machine-update.ts';

let base = '';

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'release-machine-update-'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function built(name: string, content: string): Promise<string> {
  const file = join(base, 'out', name);
  await mkdir(join(base, 'out'), { recursive: true });
  await writeFile(file, content);
  return file;
}

describe('publishing a desktop release into the hub data folder', () => {
  it('copies the files, writes checksums and sizes and swaps the folder in', async () => {
    const zip = await built('SmartEverything-linux-x64-0.4.2.zip', 'zip bytes');
    const data = join(base, 'data');
    await mkdir(data);
    const manifest = await publishMachineUpdate(data, '0.4.2', [
      { platform: 'linux', arch: 'x64', kind: 'zip', path: zip },
    ]);
    expect(manifest.artifacts[0]).toStrictEqual({
      platform: 'linux',
      arch: 'x64',
      kind: 'zip',
      file: 'SmartEverything-linux-x64-0.4.2.zip',
      sha256: createHash('sha256').update('zip bytes').digest('hex'),
      size: 9,
    });
    const stored = join(data, 'machine-updates');
    expect((await readdir(stored)).sort()).toStrictEqual([
      'SmartEverything-linux-x64-0.4.2.zip',
      'manifest.json',
    ]);
    expect(
      MACHINE_UPDATE_MANIFEST.parse(
        JSON.parse(await readFile(join(stored, 'manifest.json'), 'utf8')),
      ).version,
    ).toBe('0.4.2');
  });

  it('keeps the earlier release as .previous', async () => {
    const data = join(base, 'data');
    await mkdir(data);
    const first = await built('a-1.zip', 'one');
    await publishMachineUpdate(data, '0.4.1', [
      { platform: 'linux', arch: 'x64', kind: 'zip', path: first },
    ]);
    const second = await built('a-2.zip', 'two!');
    await publishMachineUpdate(data, '0.4.2', [
      { platform: 'linux', arch: 'x64', kind: 'zip', path: second },
    ]);
    expect(await readdir(join(data, 'machine-updates.previous'))).toContain('a-1.zip');
    expect(await readdir(join(data, 'machine-updates'))).toContain('a-2.zip');
  });

  it('stores nothing when a windows release lacks its RELEASES file', async () => {
    const data = join(base, 'data');
    await mkdir(data);
    const nupkg = await built('smarteverything-0.4.2-full.nupkg', 'pkg');
    await expect(
      publishMachineUpdate(data, '0.4.2', [
        { platform: 'win32', arch: 'x64', kind: 'nupkg', path: nupkg },
      ]),
    ).rejects.toThrow();
    expect(await readdir(data)).toStrictEqual([]);
  });
});

describe('reading the --file argument', () => {
  it('splits platform, architecture, kind and path', () => {
    expect(releaseFileOf('win32:x64:releases=out/RELEASES')).toStrictEqual({
      platform: 'win32',
      arch: 'x64',
      kind: 'releases',
      path: 'out/RELEASES',
    });
  });

  it('names what it expected when the argument is malformed', () => {
    expect(() => releaseFileOf('linux=out/app.zip')).toThrow(ReleaseFileArgumentError);
  });
});
