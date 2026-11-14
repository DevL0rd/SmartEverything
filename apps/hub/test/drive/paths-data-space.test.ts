import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeRequestPath,
  DrivePathError,
  normalizeRelativePath,
  openResolved,
  resolveInRoot,
} from '../../src/drive/paths';
import {
  readRootMarker,
  RootMarkerError,
  verifyRootMarker,
  writeRootMarker,
} from '../../src/drive/root-marker';
import {
  DataSpaceError,
  findMount,
  parseMountInfo,
  readDataSpace,
  systemDataSpace,
  type DataSpaceProbe,
} from '../../src/drive/data-space';

let base = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-paths-')));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a rejection');
}

async function directory(...parts: string[]): Promise<string> {
  const path = join(base, ...parts);
  await mkdir(path, { recursive: true });
  return path;
}

describe('path normalisation', () => {
  it('normalises to NFC', () => {
    expect(normalizeRelativePath('café/a')).toBe('café/a');
  });

  it.each(['..', 'a/../b', 'a/./b', '/abs', 'a//b', 'a/', 'a\0b'])('refuses %j', (input) => {
    expect(() => normalizeRelativePath(input)).toThrow(DrivePathError);
  });

  it('accepts the empty path as the root', () => {
    expect(normalizeRelativePath('')).toBe('');
  });
});

describe('request path decoding', () => {
  it('refuses an encoded dot-dot', () => {
    expect(() => decodeRequestPath('%2e%2e/secret')).toThrow(DrivePathError);
  });

  it('refuses a dot-dot hidden behind an encoded slash', () => {
    expect(() => decodeRequestPath('a%2f..%2fb')).toThrow(DrivePathError);
  });

  it('treats an encoded slash as a separator', () => {
    expect(decodeRequestPath('a%2fb')).toBe('a/b');
  });

  it('decodes once only, so a double-encoded dot-dot stays a literal name', () => {
    expect(decodeRequestPath('%252e%252e')).toBe('%2e%2e');
  });

  it('refuses an encoded NUL and malformed encoding', () => {
    expect(() => decodeRequestPath('a%00b')).toThrow(DrivePathError);
    expect(() => decodeRequestPath('%E0%A4%A')).toThrow(DrivePathError);
  });

  it('decodes and normalises names', () => {
    expect(decodeRequestPath('cafe%CC%81')).toBe('café');
  });
});

describe('resolver', () => {
  it('resolves the root and existing files with their identity', async () => {
    const root = await directory('root');
    await writeFile(join(root, 'a.txt'), 'hello');
    const file = await resolveInRoot(root, 'a.txt');
    expect(file.absolute).toBe(join(root, 'a.txt'));
    expect(file.identity).not.toBeNull();
    expect((await resolveInRoot(root, '')).absolute).toBe(root);
  });

  it('resolves a path that does not exist yet below an existing parent', async () => {
    const root = await directory('root');
    const resolved = await resolveInRoot(root, 'new/deep/file.txt');
    expect(resolved.absolute).toBe(join(root, 'new/deep/file.txt'));
    expect(resolved.identity).toBeNull();
  });

  it('follows a symlink that stays inside the root', async () => {
    const root = await directory('root');
    await directory('root', 'real');
    await writeFile(join(root, 'real', 'f.txt'), 'x');
    await symlink(join(root, 'real'), join(root, 'alias'));
    expect((await resolveInRoot(root, 'alias/f.txt')).absolute).toBe(join(root, 'real', 'f.txt'));
  });

  it('refuses a symlinked directory that leaves the root', async () => {
    const root = await directory('root');
    const outside = await directory('outside');
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(outside, join(root, 'link'));
    const failure = await failureOf(resolveInRoot(root, 'link/secret.txt'));
    expect(failure).toMatchObject({ failure: 'escape' });
    expect(await failureOf(resolveInRoot(root, 'link/new.txt'))).toMatchObject({
      failure: 'escape',
    });
  });

  it('refuses a symlinked file that leaves the root', async () => {
    const root = await directory('root');
    const outside = await directory('outside');
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(join(outside, 'secret.txt'), join(root, 'file'));
    expect(await failureOf(resolveInRoot(root, 'file'))).toMatchObject({ failure: 'escape' });
  });

  it('refuses a dangling symlink', async () => {
    const root = await directory('root');
    await symlink(join(base, 'nowhere'), join(root, 'dangling'));
    expect(await failureOf(resolveInRoot(root, 'dangling'))).toMatchObject({ failure: 'escape' });
  });

  it('reports a file used as a directory and a missing root', async () => {
    const root = await directory('root');
    await writeFile(join(root, 'file'), 'x');
    expect(await failureOf(resolveInRoot(root, 'file/child'))).toMatchObject({
      failure: 'not-directory',
    });
    expect(await failureOf(resolveInRoot(join(base, 'gone'), 'a'))).toMatchObject({
      failure: 'missing',
    });
  });
});

describe('opening under a root', () => {
  it('opens the resolved file', async () => {
    const root = await directory('root');
    await writeFile(join(root, 'a.txt'), 'hello');
    const handle = await openResolved(await resolveInRoot(root, 'a.txt'), 'read');
    expect(await handle.readFile('utf8')).toBe('hello');
    await handle.close();
  });

  it('refuses a path that does not exist', async () => {
    const root = await directory('root');
    const resolved = await resolveInRoot(root, 'nope');
    expect(await failureOf(openResolved(resolved, 'read'))).toMatchObject({ failure: 'missing' });
  });

  it('refuses when a directory is swapped for a symlink between check and open', async () => {
    const root = await directory('root');
    const outside = await directory('outside');
    await directory('root', 'd');
    await writeFile(join(root, 'd', 'f.txt'), 'inside');
    await writeFile(join(outside, 'f.txt'), 'outside');
    const resolved = await resolveInRoot(root, 'd/f.txt');
    await rename(join(root, 'd'), join(root, 'd-old'));
    await symlink(outside, join(root, 'd'));
    expect(await failureOf(openResolved(resolved, 'read'))).toMatchObject({ failure: 'changed' });
  });

  it('refuses when the file itself is swapped for a symlink', async () => {
    const root = await directory('root');
    const outside = await directory('outside');
    await writeFile(join(root, 'f.txt'), 'inside');
    await writeFile(join(outside, 'f.txt'), 'outside');
    const resolved = await resolveInRoot(root, 'f.txt');
    await rm(join(root, 'f.txt'));
    await symlink(join(outside, 'f.txt'), join(root, 'f.txt'));
    expect(await failureOf(openResolved(resolved, 'read'))).toMatchObject({ failure: 'escape' });
  });

  it('refuses when the file is replaced by another file', async () => {
    const root = await directory('root');
    await writeFile(join(root, 'f.txt'), 'one');
    const resolved = await resolveInRoot(root, 'f.txt');
    await rm(join(root, 'f.txt'));
    await writeFile(join(root, 'f.txt'), 'two');
    expect(await failureOf(openResolved(resolved, 'read'))).toMatchObject({ failure: 'changed' });
  });
});

const MOUNTINFO = [
  '24 1 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw',
  '30 24 8:17 / /mnt/nas\\040disk rw,relatime shared:5 - ext4 /dev/sdb1 rw',
  '31 24 0:40 / /mnt/share rw,relatime - nfs4 server:/export rw',
  '32 30 8:18 / /mnt/nas\\040disk/inner rw - xfs /dev/sdc1 rw',
].join('\n');

describe('mount table', () => {
  it('parses fields, optional fields and escapes', () => {
    const entries = parseMountInfo(MOUNTINFO);
    expect(entries).toHaveLength(4);
    expect(entries[1]).toMatchObject({
      mountId: 30,
      mountPoint: '/mnt/nas disk',
      fsType: 'ext4',
      source: '/dev/sdb1',
    });
    expect(entries[2]).toMatchObject({ fsType: 'nfs4', source: 'server:/export' });
  });

  it('refuses a malformed line', () => {
    expect(() => parseMountInfo('24 1 259:2 / / rw')).toThrow(DataSpaceError);
  });

  it('finds the deepest mount containing a path', () => {
    const entries = parseMountInfo(MOUNTINFO);
    expect(findMount(entries, '/mnt/nas disk/inner/x').source).toBe('/dev/sdc1');
    expect(findMount(entries, '/mnt/nas disk/other').source).toBe('/dev/sdb1');
    expect(findMount(entries, '/home/me').source).toBe('/dev/nvme0n1p2');
  });

  it('does not match a mount point that only shares a name prefix', () => {
    expect(findMount(parseMountInfo(MOUNTINFO), '/mnt/nas disk2/x').source).toBe('/dev/nvme0n1p2');
  });
});

describe('data space', () => {
  const probe: DataSpaceProbe = {
    readMountInfo: () => Promise.resolve(MOUNTINFO),
    space: () => Promise.resolve({ totalBytes: 1000, freeBytes: 400 }),
  };

  it('reports the disk space and filesystem of the data folder', async () => {
    const folder = await directory('data');
    expect(await readDataSpace(probe, folder)).toEqual({
      totalBytes: 1000,
      freeBytes: 400,
      fsType: 'ext4',
    });
  });

  it('reads the real mount table and statfs of this machine', async () => {
    const folder = await directory('data');
    const space = await readDataSpace(systemDataSpace, folder);
    expect(space.totalBytes).toBeGreaterThan(0);
    expect(space.freeBytes).toBeLessThanOrEqual(space.totalBytes);
    expect(space.fsType).not.toBe('');
  });
});

describe('root marker', () => {
  it('writes a marker and verifies it', async () => {
    const root = await directory('root');
    const marker = await writeRootMarker(root, 'root-1');
    expect(await readRootMarker(root)).toEqual(marker);
    await verifyRootMarker(root, marker);
    expect(await readFile(join(root, '.smarteverything', 'root.json'), 'utf8')).toContain('root-1');
  });

  it('refuses a missing marker', async () => {
    const root = await directory('root');
    expect(
      await failureOf(verifyRootMarker(root, { id: 'r', marker: 'a'.repeat(64) })),
    ).toMatchObject({
      failure: 'missing',
    });
  });

  it('refuses a different disk with another marker or id at the same path', async () => {
    const root = await directory('root');
    const registered = await writeRootMarker(root, 'root-1');
    const other = await directory('other');
    const foreign = await writeRootMarker(other, 'root-1');
    await rm(join(root, '.smarteverything'), { recursive: true });
    await rename(join(other, '.smarteverything'), join(root, '.smarteverything'));
    expect(await failureOf(verifyRootMarker(root, registered))).toMatchObject({
      failure: 'mismatch',
    });
    expect(foreign.marker).not.toBe(registered.marker);
    expect(await failureOf(verifyRootMarker(root, { ...foreign, id: 'root-2' }))).toMatchObject({
      failure: 'mismatch',
    });
  });

  it('never overwrites an existing marker', async () => {
    const root = await directory('root');
    const first = await writeRootMarker(root, 'root-1');
    expect(await failureOf(writeRootMarker(root, 'root-2'))).toMatchObject({ failure: 'exists' });
    expect(await readRootMarker(root)).toEqual(first);
    expect(await readdir(join(root, '.smarteverything'))).toEqual(['root.json']);
  });

  it('refuses an unreadable or foreign-shaped marker', async () => {
    const root = await directory('root');
    await directory('root', '.smarteverything');
    await writeFile(join(root, '.smarteverything', 'root.json'), '{not json');
    expect(await failureOf(readRootMarker(root))).toMatchObject({ failure: 'invalid' });
    await writeFile(
      join(root, '.smarteverything', 'root.json'),
      JSON.stringify({ id: 'r', marker: 'a'.repeat(64), extra: 1 }),
    );
    expect(await failureOf(readRootMarker(root))).toBeInstanceOf(RootMarkerError);
  });

  it('refuses a marker directory that is a symlink out of the root', async () => {
    const root = await directory('root');
    const outside = await directory('outside');
    await symlink(outside, join(root, '.smarteverything'));
    expect(await failureOf(writeRootMarker(root, 'root-1'))).toMatchObject({ failure: 'escape' });
    expect(await readdir(outside)).toEqual([]);
  });

  it('refuses a root id that is not a plain identifier', async () => {
    const root = await directory('root');
    await expect(writeRootMarker(root, '../evil')).rejects.toThrow();
  });
});
