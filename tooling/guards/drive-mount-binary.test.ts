import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_MOUNT_LICENSE_FILE,
  DRIVE_MOUNT_SHIPPED_NAME,
  DriveMountTargetError,
  driveMountBuildName,
  inTempRoot,
  stageDriveMount,
} from '../drive-mount/build.ts';

class BuildFailure extends Error {}
class CleanFailure extends Error {}

const EXECUTABLE_BITS = 0o111;
const noRelease = (): Promise<void> => Promise.resolve();

describe('drive mount build workspace', () => {
  it('removes the temp root after a successful build', async () => {
    let seen = '';
    const result = await inTempRoot(async (root) => {
      seen = root;
      await mkdir(join(root, 'gomod', 'pkg'), { recursive: true });
      await writeFile(join(root, 'gomod', 'pkg', 'file.go'), 'package pkg');
      return 'built';
    }, noRelease);
    expect(result).toBe('built');
    expect(existsSync(seen)).toBe(false);
  });

  it('keeps the first error and removes the temp root when the build and the module clean fail', async () => {
    const failure = new BuildFailure('go build failed');
    const release = vi.fn(() => Promise.reject(new CleanFailure('go: not found')));
    let seen = '';
    const attempt = inTempRoot((root) => {
      seen = root;
      return Promise.reject(failure);
    }, release);
    await expect(attempt).rejects.toBe(failure);
    expect(release).toHaveBeenCalledWith(seen);
    expect(existsSync(seen)).toBe(false);
  });

  it('succeeds and removes the temp root when only the module clean fails', async () => {
    let seen = '';
    const result = await inTempRoot(
      (root) => {
        seen = root;
        return Promise.resolve('built');
      },
      () => Promise.reject(new CleanFailure('go: not found')),
    );
    expect(result).toBe('built');
    expect(existsSync(seen)).toBe(false);
  });
});

describe('driveMountBuildName', () => {
  it('names the build for each shipped Linux architecture', () => {
    expect(driveMountBuildName('linux', 'x64')).toBe('se-drive-mount-linux-amd64');
    expect(driveMountBuildName('linux', 'arm64')).toBe('se-drive-mount-linux-arm64');
  });

  it('refuses a platform the helper is not built for', () => {
    expect(() => driveMountBuildName('win32', 'x64')).toThrow(DriveMountTargetError);
    expect(() => driveMountBuildName('darwin', 'arm64')).toThrow(DriveMountTargetError);
    expect(() => driveMountBuildName('linux', 'ia32')).toThrow(DriveMountTargetError);
  });
});

describe('stageDriveMount', () => {
  let root = '';
  let builds = '';
  let stage = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'drive-mount-stage-'));
    builds = join(root, 'out');
    stage = join(root, 'stage', 'drive-mount');
    await mkdir(builds, { recursive: true });
    await writeFile(join(builds, 'se-drive-mount-linux-amd64'), 'linux amd64');
    await writeFile(join(builds, 'se-drive-mount-linux-arm64'), 'linux arm64');
    await writeFile(join(builds, DRIVE_MOUNT_LICENSE_FILE), 'licence');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stages the arm64 build as an executable beside its licence', async () => {
    await stageDriveMount(builds, stage, 'linux', 'arm64');
    const binary = join(stage, DRIVE_MOUNT_SHIPPED_NAME);
    expect(await readFile(binary, 'utf8')).toBe('linux arm64');
    expect((await stat(binary)).mode & EXECUTABLE_BITS).toBe(EXECUTABLE_BITS);
    expect(await readFile(join(stage, DRIVE_MOUNT_LICENSE_FILE), 'utf8')).toBe('licence');
  });

  it('replaces what an earlier staging left behind', async () => {
    await stageDriveMount(builds, stage, 'linux', 'arm64');
    await stageDriveMount(builds, stage, 'linux', 'x64');
    expect(await readFile(join(stage, DRIVE_MOUNT_SHIPPED_NAME), 'utf8')).toBe('linux amd64');
  });

  it('fails loudly when the target has no build in the folder', async () => {
    await rm(join(builds, 'se-drive-mount-linux-arm64'));
    await expect(stageDriveMount(builds, stage, 'linux', 'arm64')).rejects.toThrow('ENOENT');
  });

  it('refuses an unsupported target before touching the stage', async () => {
    await mkdir(stage, { recursive: true });
    await writeFile(join(stage, DRIVE_MOUNT_SHIPPED_NAME), 'earlier');
    await expect(stageDriveMount(builds, stage, 'win32', 'x64')).rejects.toThrow(
      DriveMountTargetError,
    );
    expect(await readFile(join(stage, DRIVE_MOUNT_SHIPPED_NAME), 'utf8')).toBe('earlier');
  });
});
