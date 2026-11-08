import { readdir, readFile, realpath, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import { isMissing } from '../fs-util';
import { isInside } from './paths';

export const volumeIdentitySchema = z.strictObject({
  fsUuid: z.string().min(1).nullable(),
  source: z.string().min(1),
  fsType: z.string().min(1),
  mountPoint: z.string().min(1),
  rootDev: z.string().regex(/^\d+$/),
  rootIno: z.string().regex(/^\d+$/),
});

export type VolumeIdentity = z.infer<typeof volumeIdentitySchema>;

export interface MountEntry {
  readonly mountId: number;
  readonly parentId: number;
  readonly device: string;
  readonly root: string;
  readonly mountPoint: string;
  readonly options: readonly string[];
  readonly fsType: string;
  readonly source: string;
}

export interface VolumeSpace {
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export interface VolumeInfo extends VolumeSpace {
  readonly identity: VolumeIdentity;
}

export type RootAvailability = 'online' | 'offline' | 'missing' | 'different';

export interface VolumeProbe {
  readonly readMountInfo: () => Promise<string>;
  readonly stat: (path: string) => Promise<{ readonly dev: bigint; readonly ino: bigint }>;
  readonly space: (path: string) => Promise<VolumeSpace>;
  readonly fsUuid: (source: string) => Promise<string | null>;
}

export class VolumeError extends Error {
  override readonly name = 'VolumeError';
}

const UUID_DIRECTORY = '/dev/disk/by-uuid';
const DEAD_MOUNT_CODES: ReadonlySet<string> = new Set([
  'EIO',
  'ESTALE',
  'ENOTCONN',
  'ENODEV',
  'ENXIO',
]);

function unescapeMountField(value: string): string {
  const bytes = Buffer.from(value, 'utf8').toString('latin1');
  return Buffer.from(
    bytes.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8))),
    'latin1',
  ).toString('utf8');
}

function parseMountLine(line: string): MountEntry {
  const fields = line.split(' ');
  const separator = fields.indexOf('-');
  const [mountId, parentId, device, root, mountPoint, options] = fields;
  const fsType = fields[separator + 1];
  const source = fields[separator + 2];
  if (
    separator < 6 ||
    mountId === undefined ||
    parentId === undefined ||
    device === undefined ||
    root === undefined ||
    mountPoint === undefined ||
    options === undefined ||
    fsType === undefined ||
    source === undefined
  ) {
    throw new VolumeError('A line of the mount table is malformed.');
  }
  return {
    mountId: Number(mountId),
    parentId: Number(parentId),
    device,
    root: unescapeMountField(root),
    mountPoint: unescapeMountField(mountPoint),
    options: options.split(','),
    fsType,
    source: unescapeMountField(source),
  };
}

export function parseMountInfo(text: string): readonly MountEntry[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map(parseMountLine);
}

export function findMount(entries: readonly MountEntry[], realPath: string): MountEntry {
  let best: MountEntry | null = null;
  for (const entry of entries) {
    const longer = best === null || entry.mountPoint.length >= best.mountPoint.length;
    if (longer && isInside(entry.mountPoint, realPath)) {
      best = entry;
    }
  }
  if (best === null) {
    throw new VolumeError(`No mount contains ${realPath}.`);
  }
  return best;
}

async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (cause) {
    if (isMissing(cause)) {
      return null;
    }
    throw cause;
  }
}

async function uuidOfSource(source: string): Promise<string | null> {
  if (!source.startsWith('/')) {
    return null;
  }
  const names = await readdir(UUID_DIRECTORY).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT') {
      return [];
    }
    throw cause;
  });
  const device = (await realpathOrNull(source)) ?? source;
  for (const name of names) {
    const target = await realpathOrNull(join(UUID_DIRECTORY, name));
    if (target === device) {
      return name;
    }
  }
  return null;
}

export const systemProbe: VolumeProbe = {
  readMountInfo: () => readFile('/proc/self/mountinfo', 'utf8'),
  stat: async (path) => {
    const { dev, ino } = await stat(path, { bigint: true });
    return { dev, ino };
  },
  space: async (path) => {
    const { blocks, bavail, bsize } = await statfs(path, { bigint: true });
    return { totalBytes: Number(blocks * bsize), freeBytes: Number(bavail * bsize) };
  },
  fsUuid: uuidOfSource,
};

export async function volumeOf(
  realPath: string,
  probe: VolumeProbe = systemProbe,
): Promise<VolumeInfo> {
  const mount = findMount(parseMountInfo(await probe.readMountInfo()), realPath);
  const [identity, space, fsUuid] = await Promise.all([
    probe.stat(realPath),
    probe.space(realPath),
    probe.fsUuid(mount.source),
  ]);
  return {
    identity: {
      fsUuid,
      source: mount.source,
      fsType: mount.fsType,
      mountPoint: mount.mountPoint,
      rootDev: identity.dev.toString(),
      rootIno: identity.ino.toString(),
    },
    ...space,
  };
}

export function sameVolume(recorded: VolumeIdentity, current: VolumeIdentity): boolean {
  const sameDisk =
    recorded.fsUuid !== null && current.fsUuid !== null
      ? recorded.fsUuid === current.fsUuid
      : recorded.source === current.source && recorded.fsType === current.fsType;
  return sameDisk && recorded.rootIno === current.rootIno;
}

async function statOrState(
  probe: VolumeProbe,
  path: string,
): Promise<'missing' | 'offline' | null> {
  try {
    await probe.stat(path);
    return null;
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return 'missing';
    }
    if (code !== undefined && DEAD_MOUNT_CODES.has(code)) {
      return 'offline';
    }
    throw cause;
  }
}

export async function rootAvailability(
  recorded: VolumeIdentity,
  rootPath: string,
  probe: VolumeProbe = systemProbe,
): Promise<RootAvailability> {
  const entries = parseMountInfo(await probe.readMountInfo());
  if (!entries.some((entry) => entry.mountPoint === recorded.mountPoint)) {
    return 'offline';
  }
  const state = await statOrState(probe, rootPath);
  if (state !== null) {
    return state;
  }
  const current = await volumeOf(rootPath, probe);
  return sameVolume(recorded, current.identity) ? 'online' : 'different';
}
