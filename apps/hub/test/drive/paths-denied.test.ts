import { chmod, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { DrivePathError, resolveInRoot } from '../../src/drive/paths';
import { driveErrorCode } from '../../src/server/handlers/drive-errors';

let base = '';
const lockedFolders: string[] = [];

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-denied-')));
});

afterEach(async () => {
  for (const path of lockedFolders.splice(0)) {
    await chmod(path, 0o755);
  }
  await rm(base, { recursive: true, force: true });
});

async function directory(...parts: string[]): Promise<string> {
  const path = join(base, ...parts);
  await mkdir(path, { recursive: true });
  return path;
}

async function lockedFolder(root: string): Promise<string> {
  const path = join(root, 'locked');
  await mkdir(join(path, 'child'), { recursive: true });
  await chmod(path, 0o000);
  lockedFolders.push(path);
  return path;
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a rejection');
}

describe('resolving under a folder the hub cannot read', () => {
  it.skipIf(process.getuid?.() === 0)('refuses a path inside it as denied', async () => {
    const root = await directory('root');
    await lockedFolder(root);
    const failure = await failureOf(resolveInRoot(root, 'locked/child'));
    expect(failure).toBeInstanceOf(DrivePathError);
    expect(failure).toMatchObject({ failure: 'denied' });
    expect(driveErrorCode(failure)).toBe('forbidden');
  });

  it.skipIf(process.getuid?.() === 0)(
    'refuses the same path below a managed root as denied',
    async () => {
      const data = await directory('config', 'SmartEverything');
      const root = hubLayout(data, {}).home.drive;
      await mkdir(root, { recursive: true });
      await lockedFolder(root);
      const failure = await failureOf(resolveInRoot(root, 'locked/child'));
      expect(failure).toBeInstanceOf(DrivePathError);
      expect(failure).toMatchObject({ failure: 'denied' });
    },
  );
});
