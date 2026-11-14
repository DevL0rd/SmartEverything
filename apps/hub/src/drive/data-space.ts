import { readFile, realpath, statfs } from 'node:fs/promises';
import type { DriveDataSpace } from '@smarteverything/domain';
import { isInside } from './paths';

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

export interface DiskSpace {
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export interface DataSpaceProbe {
  readonly readMountInfo: () => Promise<string>;
  readonly space: (path: string) => Promise<DiskSpace>;
}

export class DataSpaceError extends Error {
  override readonly name = 'DataSpaceError';
}

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
    throw new DataSpaceError('A line of the mount table is malformed.');
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
    throw new DataSpaceError(`No mount contains ${realPath}.`);
  }
  return best;
}

export const systemDataSpace: DataSpaceProbe = {
  readMountInfo: () => readFile('/proc/self/mountinfo', 'utf8'),
  space: async (path) => {
    const { blocks, bavail, bsize } = await statfs(path, { bigint: true });
    return { totalBytes: Number(blocks * bsize), freeBytes: Number(bavail * bsize) };
  },
};

export async function readDataSpace(
  probe: DataSpaceProbe,
  dataFolder: string,
): Promise<DriveDataSpace> {
  const real = await realpath(dataFolder);
  const [mounts, space] = await Promise.all([probe.readMountInfo(), probe.space(real)]);
  return { ...space, fsType: findMount(parseMountInfo(mounts), real).fsType };
}
