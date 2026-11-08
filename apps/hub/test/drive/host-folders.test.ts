import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrivePathError } from '../../src/drive/paths';
import { listHostFolders } from '../../src/drive/host-folders';

let base = '';
let disk = '';
let outside = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-host-folders-')));
  disk = join(base, 'disk');
  outside = join(base, 'outside');
  await mkdir(join(disk, 'photos', 'trips'), { recursive: true });
  await mkdir(join(disk, '.hidden'), { recursive: true });
  await mkdir(join(disk, 'docs'), { recursive: true });
  await writeFile(join(disk, 'file.txt'), 'x');
  await mkdir(join(outside, 'secret'), { recursive: true });
  await symlink(outside, join(disk, 'escape'));
  await symlink(join(disk, 'docs'), join(disk, 'inside-link'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a rejection');
}

describe('listing hub host folders', () => {
  it('lists the disks themselves when no path is given', async () => {
    expect(await listHostFolders([disk], undefined)).toEqual({
      path: null,
      parent: null,
      folders: [{ name: 'disk', path: disk, hidden: false }],
    });
  });

  it('lists only the folders of a disk, sorted, with hidden marked and no files or symlinks', async () => {
    const listing = await listHostFolders([disk], disk);
    expect(listing.path).toBe(disk);
    expect(listing.parent).toBeNull();
    expect(listing.folders).toEqual([
      { name: '.hidden', path: join(disk, '.hidden'), hidden: true },
      { name: 'docs', path: join(disk, 'docs'), hidden: false },
      { name: 'photos', path: join(disk, 'photos'), hidden: false },
    ]);
  });

  it('gives the parent inside the disk for a nested folder', async () => {
    const listing = await listHostFolders([disk], join(disk, 'photos'));
    expect(listing.parent).toBe(disk);
    expect(listing.folders).toEqual([
      { name: 'trips', path: join(disk, 'photos', 'trips'), hidden: false },
    ]);
  });

  it('refuses a path outside every disk', async () => {
    expect(await refusal(listHostFolders([disk], outside))).toMatchObject({ failure: 'escape' });
  });

  it('refuses a dot-dot path that leaves the disk', async () => {
    const cause = await refusal(listHostFolders([disk], join(disk, '..', 'outside')));
    expect(cause).toMatchObject({ failure: 'escape' });
  });

  it('refuses a symlink that leads out of the disk', async () => {
    const cause = await refusal(listHostFolders([disk], join(disk, 'escape', 'secret')));
    expect(cause).toBeInstanceOf(DrivePathError);
    expect(cause).toMatchObject({ failure: 'escape' });
  });

  it('follows a symlink that stays inside the disk to its real path', async () => {
    const listing = await listHostFolders([disk], join(disk, 'inside-link'));
    expect(listing.path).toBe(join(disk, 'docs'));
  });

  it('refuses relative, missing and file paths', async () => {
    expect(await refusal(listHostFolders([disk], 'photos'))).toMatchObject({ failure: 'invalid' });
    expect(await refusal(listHostFolders([disk], join(disk, 'nope')))).toMatchObject({
      failure: 'missing',
    });
    expect(await refusal(listHostFolders([disk], join(disk, 'file.txt')))).toMatchObject({
      failure: 'not-directory',
    });
  });

  it('allows nothing when no disk is mounted', async () => {
    expect(await refusal(listHostFolders([], disk))).toMatchObject({ failure: 'escape' });
  });
});
