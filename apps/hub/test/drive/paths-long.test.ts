import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DrivePathError,
  locateInRoot,
  openResolved,
  resolveInRoot,
  withPathScope,
} from '../../src/drive/paths';

const run = promisify(execFile);

const FOLDER = 'd'.repeat(250);

const DEPTH = 18;

let root = '';

beforeEach(async () => {
  root = join(await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-long-'))), 'root');
  await mkdir(root);
});

afterEach(async () => {
  await run('rm', ['-rf', join(root, '..')]);
});

function deep(count: number): string {
  return Array.from({ length: count }, () => FOLDER).join('/');
}

async function openDescriptors(): Promise<number> {
  return (await readdir('/proc/self/fd')).length;
}

async function buildDeep(): Promise<string> {
  await withPathScope(async () => {
    for (let level = 1; level <= DEPTH; level += 1) {
      await mkdir(await locateInRoot(root, deep(level)));
    }
  });
  return deep(DEPTH);
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a failure');
}

describe('paths longer than the disk path limit', () => {
  it('creates, resolves, opens and reads a file below folders longer than PATH_MAX', async () => {
    const folders = await buildDeep();
    expect(Buffer.byteLength(join(root, folders))).toBeGreaterThan(4096);
    const text = await withPathScope(async () => {
      await writeFile(await locateInRoot(root, `${folders}/file.txt`), 'deep');
      const resolved = await resolveInRoot(root, `${folders}/file.txt`);
      expect(resolved.identity).not.toBeNull();
      expect(Buffer.byteLength(resolved.absolute)).toBeLessThan(4096);
      const handle = await openResolved(resolved, 'read');
      try {
        return await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    });
    expect(text).toBe('deep');
  });

  it('reports a missing tail below long folders as missing, not as an error', async () => {
    const folders = await buildDeep();
    const resolved = await withPathScope(() => resolveInRoot(root, `${folders}/absent/file.txt`));
    expect(resolved.identity).toBeNull();
  });

  it('refuses a long path outside a file operation instead of handing out a path the disk cannot take', async () => {
    const folders = await buildDeep();
    expect(await failureOf(resolveInRoot(root, `${folders}/file.txt`))).toMatchObject({
      failure: 'invalid',
    });
  });

  it('keeps short paths as plain paths under the root', async () => {
    await mkdir(join(root, 'a'));
    await writeFile(join(root, 'a', 'b.txt'), 'x');
    expect((await resolveInRoot(root, 'a/b.txt')).absolute).toBe(join(root, 'a', 'b.txt'));
    expect(await locateInRoot(root, 'a/new.txt')).toBe(join(root, 'a', 'new.txt'));
  });
});

describe('symlinks on the walk', () => {
  it('refuses a symlinked folder and a symlinked last entry anywhere on a long path', async () => {
    const folders = await buildDeep();
    const outside = join(root, '..', 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await withPathScope(async () => {
      await symlink(outside, await locateInRoot(root, `${folders}/link`));
      await symlink(join(outside, 'secret.txt'), await locateInRoot(root, `${folders}/file-link`));
      for (const path of [
        `${folders}/link/secret.txt`,
        `${folders}/link/new.txt`,
        `${folders}/file-link`,
      ]) {
        const failure = await failureOf(resolveInRoot(root, path));
        expect(failure).toBeInstanceOf(DrivePathError);
        expect(failure).toMatchObject({ failure: 'escape' });
      }
      expect(await failureOf(locateInRoot(root, `${folders}/link/new.txt`))).toMatchObject({
        failure: 'escape',
      });
    });
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('names a file used as a folder as not a directory', async () => {
    await writeFile(join(root, 'plain'), 'x');
    expect(await failureOf(resolveInRoot(root, 'plain/child'))).toMatchObject({
      failure: 'not-directory',
    });
  });
});

describe('folder handles of a file operation', () => {
  it('closes every folder handle when the operation ends, whether it succeeds or fails', async () => {
    const folders = await buildDeep();
    const before = await openDescriptors();
    await withPathScope(async () => {
      await resolveInRoot(root, `${folders}/a.txt`);
      await locateInRoot(root, `${folders}/b.txt`);
      expect(await openDescriptors()).toBeGreaterThan(before);
    });
    expect(await openDescriptors()).toBe(before);
    await expect(
      withPathScope(async () => {
        await locateInRoot(root, `${folders}/c.txt`);
        throw new Error('the operation failed');
      }),
    ).rejects.toThrow('the operation failed');
    expect(await openDescriptors()).toBe(before);
    await resolveInRoot(root, 'short.txt');
    expect(await openDescriptors()).toBe(before);
  });

  it('shares one scope across nested operations and closes it once at the outer end', async () => {
    const folders = await buildDeep();
    const before = await openDescriptors();
    await withPathScope(async () => {
      const inner = await withPathScope(() => locateInRoot(root, `${folders}/x.txt`));
      await writeFile(inner, 'still open');
    });
    expect(await openDescriptors()).toBe(before);
  });
});
