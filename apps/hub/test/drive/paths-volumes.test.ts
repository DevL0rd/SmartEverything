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
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkRootPlacement,
  decodeRequestPath,
  DrivePathError,
  normalizeRelativePath,
  openResolved,
  resolveInRoot,
  RootPlacementError,
} from '../../src/drive/paths';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import {
  linkedRootAvailability,
  readRootMarker,
  RootMarkerError,
  verifyRootMarker,
  writeLinkedRecord,
  writeRootMarker,
} from '../../src/drive/root-marker';
import {
  findMount,
  parseMountInfo,
  rootAvailability,
  sameVolume,
  systemProbe,
  VolumeError,
  volumeOf,
  type VolumeProbe,
} from '../../src/drive/volumes';

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

describe('root placement', () => {
  async function layout(): Promise<{ data: string; install: string; existing: string }> {
    const data = await directory('config', 'SmartEverything');
    const install = await directory('opt', 'Hub');
    const existing = await directory('nas', 'photos');
    return { data, install, existing };
  }

  async function place(candidate: string, existing: readonly string[] = []): Promise<string> {
    const { data, install } = await layout();
    return checkRootPlacement({
      candidate,
      layout: hubLayout(data, {}),
      hubInstallDirectory: install,
      existingRoots: existing,
    });
  }

  it('accepts an unrelated directory and returns its real path', async () => {
    const free = await directory('nas', 'free');
    expect(await place(free)).toBe(free);
  });

  it('resolves a symlinked candidate before checking it', async () => {
    const { data } = await layout();
    await symlink(data, join(base, 'sneaky'));
    expect(await failureOf(place(join(base, 'sneaky')))).toMatchObject({
      reason: 'inside-hub-data',
    });
  });

  it('refuses a directory inside the hub data directory', async () => {
    const { data } = await layout();
    const inside = await directory('config', 'SmartEverything', 'elsewhere');
    expect(await failureOf(place(inside))).toMatchObject({ reason: 'inside-hub-data' });
    expect(await failureOf(place(data))).toBeInstanceOf(RootPlacementError);
  });

  it('refuses a directory that contains the hub data directory', async () => {
    expect(await failureOf(place(join(base, 'config')))).toMatchObject({
      reason: 'contains-hub-data',
    });
  });

  async function managedFolder(path: (hub: HubLayout) => string): Promise<string> {
    const { data } = await layout();
    const folder = path(hubLayout(data, {}));
    await mkdir(folder, { recursive: true });
    return folder;
  }

  it('allows the home drive and a person drive inside the hub data directory', async () => {
    const home = await managedFolder((hub) => hub.home.drive);
    const person = await managedFolder((hub) => hub.person('p1').drive);
    expect(await place(home)).toBe(home);
    expect(await place(person)).toBe(person);
  });

  it('refuses any other folder inside the hub data directory', async () => {
    const people = await managedFolder((hub) => dirname(hub.person('p1').drive));
    const below = await managedFolder((hub) => join(hub.home.drive, 'sub'));
    expect(await failureOf(place(people))).toMatchObject({ reason: 'inside-hub-data' });
    expect(await failureOf(place(below))).toMatchObject({ reason: 'inside-hub-data' });
  });

  it('refuses a directory inside or containing the install directory', async () => {
    const inside = await directory('opt', 'Hub', 'lib');
    expect(await failureOf(place(inside))).toMatchObject({ reason: 'inside-install' });
    expect(await failureOf(place(join(base, 'opt')))).toMatchObject({ reason: 'contains-install' });
  });

  it('refuses a nested, containing or identical root', async () => {
    const { existing } = await layout();
    const inside = await directory('nas', 'photos', 'raw');
    expect(await failureOf(place(inside, [existing]))).toMatchObject({ reason: 'inside-existing' });
    expect(await failureOf(place(join(base, 'nas'), [existing]))).toMatchObject({
      reason: 'contains-existing',
    });
    expect(await failureOf(place(existing, [existing]))).toMatchObject({
      reason: 'same-as-existing',
    });
  });

  it('applies the nesting rule to managed roots too', async () => {
    const managed = await managedFolder((hub) => hub.home.drive);
    const person = await managedFolder((hub) => hub.person('p1').drive);
    expect(await failureOf(place(managed, [managed]))).toMatchObject({
      reason: 'same-as-existing',
    });
    expect(await place(person, [managed])).toBe(person);
  });

  it('refuses a candidate that is not a directory', async () => {
    await layout();
    await writeFile(join(base, 'file'), 'x');
    expect(await failureOf(place(join(base, 'file')))).toMatchObject({ failure: 'not-directory' });
    expect(await failureOf(place(join(base, 'gone')))).toMatchObject({ failure: 'missing' });
  });
});

const MOUNTINFO = [
  '24 1 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw',
  '30 24 8:17 / /mnt/nas\\040disk rw,relatime shared:5 - ext4 /dev/sdb1 rw',
  '31 24 0:40 / /mnt/share rw,relatime - nfs4 server:/export rw',
  '32 30 8:18 / /mnt/nas\\040disk/inner rw - xfs /dev/sdc1 rw',
].join('\n');

interface FakeDisk {
  readonly mountinfo: string;
  readonly uuids: Readonly<Record<string, string>>;
  readonly inode: bigint;
  readonly stat?: (path: string) => Promise<{ dev: bigint; ino: bigint }>;
}

function fakeProbe(disk: FakeDisk): VolumeProbe {
  return {
    readMountInfo: () => Promise.resolve(disk.mountinfo),
    stat:
      disk.stat ??
      ((): Promise<{ dev: bigint; ino: bigint }> => Promise.resolve({ dev: 77n, ino: disk.inode })),
    space: () => Promise.resolve({ totalBytes: 1000, freeBytes: 400 }),
    fsUuid: (source) => Promise.resolve(disk.uuids[source] ?? null),
  };
}

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
    expect(() => parseMountInfo('24 1 259:2 / / rw')).toThrow(VolumeError);
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

describe('volume identity', () => {
  const disk: FakeDisk = {
    mountinfo: MOUNTINFO,
    uuids: { '/dev/sdb1': 'uuid-b' },
    inode: 5n,
  };

  it('describes a volume with its space and uuid', async () => {
    const info = await volumeOf('/mnt/nas disk/photos', fakeProbe(disk));
    expect(info.identity).toEqual({
      fsUuid: 'uuid-b',
      source: '/dev/sdb1',
      fsType: 'ext4',
      mountPoint: '/mnt/nas disk',
      rootDev: '77',
      rootIno: '5',
    });
    expect(info.totalBytes).toBe(1000);
    expect(info.freeBytes).toBe(400);
  });

  it('reads the real mount table and statfs of this machine', async () => {
    const info = await volumeOf(base, systemProbe);
    expect(info.totalBytes).toBeGreaterThan(0);
    expect(info.identity.mountPoint.startsWith('/')).toBe(true);
    expect(info.identity.rootIno).toMatch(/^\d+$/);
  });

  it('is online when the same disk is mounted', async () => {
    const { identity } = await volumeOf('/mnt/nas disk/photos', fakeProbe(disk));
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', fakeProbe(disk))).toBe(
      'online',
    );
  });

  it('refuses a different disk mounted at the same path', async () => {
    const { identity } = await volumeOf('/mnt/nas disk/photos', fakeProbe(disk));
    const swapped = fakeProbe({ ...disk, uuids: { '/dev/sdb1': 'uuid-other' } });
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', swapped)).toBe('different');
    const sameUuidOtherRoot = fakeProbe({ ...disk, inode: 9n });
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', sameUuidOtherRoot)).toBe(
      'different',
    );
  });

  it('matches by source and type when there is no uuid', () => {
    const left = {
      fsUuid: null,
      source: 'server:/export',
      fsType: 'nfs4',
      mountPoint: '/mnt/share',
      rootDev: '1',
      rootIno: '2',
    };
    expect(sameVolume(left, { ...left, rootDev: '9' })).toBe(true);
    expect(sameVolume(left, { ...left, source: 'other:/export' })).toBe(false);
  });

  it('is offline when the volume is unmounted and keeps reporting it without error', async () => {
    const { identity } = await volumeOf('/mnt/nas disk/photos', fakeProbe(disk));
    const unmounted = fakeProbe({
      ...disk,
      mountinfo: MOUNTINFO.split('\n')
        .filter((line) => !line.includes('/mnt/nas'))
        .join('\n'),
    });
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', unmounted)).toBe('offline');
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', unmounted)).toBe('offline');
  });

  it('is offline for a dead network mount and missing for a deleted directory', async () => {
    const { identity } = await volumeOf('/mnt/nas disk/photos', fakeProbe(disk));
    const failing = (code: string): VolumeProbe =>
      fakeProbe({
        ...disk,
        stat: () => Promise.reject(Object.assign(new Error(code), { code })),
      });
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', failing('ESTALE'))).toBe(
      'offline',
    );
    expect(await rootAvailability(identity, '/mnt/nas disk/photos', failing('ENOENT'))).toBe(
      'missing',
    );
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

describe('linked root record', () => {
  const data = (): HubLayout => hubLayout(join(base, 'data'), {});
  const disk: FakeDisk = { mountinfo: MOUNTINFO, uuids: { '/dev/sdb1': 'uuid-b' }, inode: 5n };

  it('records the identity outside the root and writes nothing into it', async () => {
    const root = await directory('linked');
    const record = await writeLinkedRecord(
      data(),
      'root-1',
      root,
      fakeProbe({ ...disk, mountinfo: '1 0 1:1 / / rw - ext4 /dev/sdb1 rw' }),
    );
    expect(record.volume.fsUuid).toBe('uuid-b');
    expect(await readdir(root)).toEqual([]);
    expect(await readdir(data().system.driveMeta('root-1'))).toEqual(['root.json']);
  });

  it('reports availability from the stored record', async () => {
    const root = await directory('linked');
    const mounted = fakeProbe({ ...disk, mountinfo: '1 0 1:1 / / rw - ext4 /dev/sdb1 rw' });
    await writeLinkedRecord(data(), 'root-1', root, mounted);
    expect(await linkedRootAvailability(data(), 'root-1', root, mounted)).toBe('online');
    const swapped = fakeProbe({
      ...disk,
      mountinfo: '1 0 1:1 / / rw - ext4 /dev/sdb1 rw',
      uuids: { '/dev/sdb1': 'uuid-new' },
    });
    expect(await linkedRootAvailability(data(), 'root-1', root, swapped)).toBe('different');
  });

  it('refuses a missing record and an unsafe id', async () => {
    const root = await directory('linked');
    expect(await failureOf(linkedRootAvailability(data(), 'nope', root))).toMatchObject({
      failure: 'missing',
    });
    await expect(linkedRootAvailability(data(), '../x', root)).rejects.toThrow();
  });
});
