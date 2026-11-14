import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  statfs,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fsCode } from '../../fs-code';
import { LocationError, readMarker } from '../pointer';
import { readMoveMarker } from './manifest';
import { lstatIfPresent } from './walk';

const SAMPLE_FILE = 'layout.json';
const REFLINK_UNAVAILABLE: ReadonlySet<string> = new Set([
  'EXDEV',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EINVAL',
  'ENOSYS',
  'ENOENT',
]);
const NFS_MAGIC = 0x6969;
const CIFS_MAGIC = 0xff534d42;
const SMB_MAGIC = 0x517b;
const SMB2_MAGIC = 0xfe534d42;
const FUSE_MAGIC = 0x65735546;

const NETWORK_FILESYSTEMS: ReadonlyMap<number, string> = new Map([
  [NFS_MAGIC, 'NFS'],
  [CIFS_MAGIC, 'CIFS'],
  [SMB_MAGIC, 'SMB'],
  [SMB2_MAGIC, 'SMB2'],
  [FUSE_MAGIC, 'FUSE'],
]);

export const PREFLIGHT_REFUSALS = [
  'inside-old-root',
  'contains-old-root',
  'inside-install',
  'contains-install',
  'inside-bootstrap',
  'contains-bootstrap',
  'not-a-folder',
  'not-empty',
  'not-writable',
  'network-filesystem',
  'probe-failed',
  'not-enough-space',
] as const;

export type PreflightRefusalCode = (typeof PREFLIGHT_REFUSALS)[number];

export class PreflightRefusal extends Error {
  override readonly name = 'PreflightRefusal';

  constructor(
    readonly code: PreflightRefusalCode,
    message: string,
  ) {
    super(message);
  }
}

export interface FilesystemSpace {
  readonly type: number;
  readonly blockSize: number;
  readonly availableBlocks: number;
}

export interface PreflightOperations {
  readonly space: (path: string) => Promise<FilesystemSpace>;
  readonly probe: (directory: string) => Promise<void>;
  readonly reflink: (sampleFile: string, directory: string) => Promise<boolean>;
}

export interface PreflightInput {
  readonly oldRoot: string;
  readonly newRoot: string;
  readonly rootId: string;
  readonly moveId: string;
  readonly installDirectory: string;
  readonly bootstrapDirectory: string;
  readonly bytesToCopy: number;
}

export interface PreflightResult {
  readonly resume: boolean;
  readonly reflink: boolean;
  readonly freeBytes: number;
  readonly requiredBytes: number;
}

async function nodeSpace(path: string): Promise<FilesystemSpace> {
  const stats = await statfs(path);
  return { type: stats.type, blockSize: stats.bsize, availableBlocks: stats.bavail };
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function nodeProbe(directory: string): Promise<void> {
  const probe = join(directory, `.move-probe-${randomUUID()}`);
  await mkdir(probe);
  try {
    const first = join(probe, 'first');
    const second = join(probe, 'second');
    await writeFile(first, 'probe');
    await writeFile(second, 'probe');
    await syncFile(first);
    await rename(first, second);
    await chmod(second, 0o600);
    await symlink(second, join(probe, 'link'));
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

async function nodeReflink(sampleFile: string, directory: string): Promise<boolean> {
  const probe = join(directory, `.move-reflink-${randomUUID()}`);
  try {
    await copyFile(sampleFile, probe, constants.COPYFILE_FICLONE_FORCE);
    return true;
  } catch (error) {
    if (REFLINK_UNAVAILABLE.has(fsCode(error) ?? '')) {
      return false;
    }
    throw error;
  } finally {
    await rm(probe, { force: true });
  }
}

const NODE_PREFLIGHT_OPERATIONS: PreflightOperations = {
  space: nodeSpace,
  probe: nodeProbe,
  reflink: nodeReflink,
};

async function existingAncestor(path: string): Promise<string> {
  let current = path;
  while ((await lstatIfPresent(current)) === undefined) {
    current = dirname(current);
  }
  return current;
}

export async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const anchor = await existingAncestor(absolute);
  return join(await realpath(anchor), relative(anchor, absolute));
}

function isWithin(outer: string, inner: string): boolean {
  const path = relative(outer, inner);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

interface Related {
  readonly path: string;
  readonly inside: PreflightRefusalCode;
  readonly contains: PreflightRefusalCode;
  readonly label: string;
}

function refuseRelated(target: string, related: Related): void {
  if (isWithin(related.path, target)) {
    throw new PreflightRefusal(
      related.inside,
      `The new data folder ${target} is inside ${related.label} ${related.path}.`,
    );
  }
  if (isWithin(target, related.path)) {
    throw new PreflightRefusal(
      related.contains,
      `The new data folder ${target} contains ${related.label} ${related.path}.`,
    );
  }
}

async function refuseOverlaps(input: PreflightInput, target: string): Promise<void> {
  const related: readonly Related[] = [
    {
      path: await canonicalPath(input.oldRoot),
      inside: 'inside-old-root',
      contains: 'contains-old-root',
      label: 'the current data folder',
    },
    {
      path: await canonicalPath(input.installDirectory),
      inside: 'inside-install',
      contains: 'contains-install',
      label: 'the hub installation',
    },
    {
      path: await canonicalPath(input.bootstrapDirectory),
      inside: 'inside-bootstrap',
      contains: 'contains-bootstrap',
      label: 'the hub bootstrap folder',
    },
  ];
  for (const entry of related) {
    refuseRelated(target, entry);
  }
}

async function entriesOf(target: string): Promise<readonly string[] | undefined> {
  try {
    return await readdir(target);
  } catch (error) {
    const code = fsCode(error);
    if (code === 'ENOENT') {
      return undefined;
    }
    if (code === 'ENOTDIR') {
      throw new PreflightRefusal('not-a-folder', `The new data folder ${target} is not a folder.`);
    }
    throw error;
  }
}

async function isMovedLayout(target: string, rootId: string): Promise<boolean> {
  try {
    const marker = await readMarker({ marker: join(target, 'layout.json') });
    return marker?.rootId === rootId && marker.state === 'moved';
  } catch (error) {
    if (error instanceof LocationError) {
      return false;
    }
    throw error;
  }
}

async function isResumeTarget(input: PreflightInput, target: string): Promise<boolean> {
  const own = await readMoveMarker(target);
  if (own?.moveId === input.moveId && own.rootId === input.rootId) {
    return true;
  }
  return isMovedLayout(target, input.rootId);
}

async function refuseUnusable(input: PreflightInput, target: string): Promise<boolean> {
  const entries = await entriesOf(target);
  if (entries === undefined || entries.length === 0) {
    return false;
  }
  if (await isResumeTarget(input, target)) {
    return true;
  }
  throw new PreflightRefusal(
    'not-empty',
    `The new data folder ${target} is not empty and was not created by this move.`,
  );
}

async function probeBase(target: string): Promise<string> {
  const anchor = await existingAncestor(target);
  const info = await lstat(anchor);
  if (!info.isDirectory()) {
    throw new PreflightRefusal('not-a-folder', `${anchor} is not a folder.`);
  }
  return anchor;
}

async function refuseUnwritable(base: string): Promise<void> {
  try {
    await access(base, constants.W_OK | constants.X_OK);
  } catch (error) {
    throw new PreflightRefusal(
      'not-writable',
      `The folder ${base} is not writable (${fsCode(error) ?? 'unknown error'}).`,
    );
  }
}

function refuseNetwork(space: FilesystemSpace, base: string): void {
  const network = NETWORK_FILESYSTEMS.get(space.type);
  if (network !== undefined) {
    throw new PreflightRefusal(
      'network-filesystem',
      `${base} is on a ${network} filesystem; the database needs local file locking.`,
    );
  }
}

async function refuseFailedProbe(operations: PreflightOperations, base: string): Promise<void> {
  try {
    await operations.probe(base);
  } catch (error) {
    throw new PreflightRefusal(
      'probe-failed',
      `The filesystem at ${base} failed the safety probe: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runPreflight(
  input: PreflightInput,
  operations: PreflightOperations = NODE_PREFLIGHT_OPERATIONS,
): Promise<PreflightResult> {
  const target = await canonicalPath(input.newRoot);
  await refuseOverlaps(input, target);
  const resume = await refuseUnusable(input, target);
  const base = await probeBase(target);
  await refuseUnwritable(base);
  const space = await operations.space(base);
  refuseNetwork(space, base);
  await refuseFailedProbe(operations, base);
  const reflink = await operations.reflink(join(input.oldRoot, SAMPLE_FILE), base);
  const freeBytes = space.availableBlocks * space.blockSize;
  const requiredBytes = reflink ? 0 : input.bytesToCopy;
  if (freeBytes < requiredBytes) {
    throw new PreflightRefusal(
      'not-enough-space',
      `The new data folder needs ${String(requiredBytes)} bytes but only ${String(freeBytes)} are free.`,
    );
  }
  return { resume, reflink, freeBytes, requiredBytes };
}
