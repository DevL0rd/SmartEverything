import { basename } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { SETATTR_VALID, type RequestMeta } from '@smarteverything/domain/drive-mount';
import type { SyncXattr } from '@smarteverything/domain/drive-sync';
import { ApiError } from '@smarteverything/domain';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import { PosixScope } from '../posix/env';
import type { SyncScope } from './placement-scope';
import { syncActor, type Origin, type SyncEnv } from './server-ops';

const OP_KEY = new Uint8Array(16);

const NO_FLAGS = 0;

export interface SyncCall {
  readonly env: SyncEnv;
  readonly origin: Origin;
  readonly scope: SyncScope;
}

export interface WantedMeta {
  readonly mode: number;
  readonly mtimeNs: string;
  readonly xattrs: readonly SyncXattr[];
}

export function inodeOf(env: SyncEnv, rootId: string, item: DriveItem | null): Promise<DriveInode> {
  return env.store.host.read('driveSyncInode', { rootId, itemId: item?.id ?? null });
}

export async function posixScopeOf({ env, origin, scope }: SyncCall): Promise<PosixScope> {
  const rootInode = await inodeOf(env, scope.drive.id, scope.base);
  return new PosixScope(
    { profileId: origin.profileId, nodeId: origin.deviceId },
    origin.placementId,
    { drive: scope.drive, baseId: scope.base?.id ?? null, rootInode: rootInode.id },
  );
}

function parentInodeOf({ env, scope }: SyncCall, drivePath: string): Promise<number> {
  return env.store.host.read('driveSyncParentInode', { rootId: scope.drive.id, drivePath });
}

async function created({ env, scope }: SyncCall, drivePath: string): Promise<DriveItem> {
  const item = await env.store.host.call('driveItems', 'byPath', scope.drive.id, drivePath, null);
  if (item === undefined) {
    throw new ApiError('internal', 'The new item is missing after it was made.');
  }
  return item;
}

export async function createSymlink(
  call: SyncCall,
  drivePath: string,
  target: string,
): Promise<DriveItem> {
  const lease = await call.env.store.host.call(
    'driveInodeLeases',
    'grant',
    call.origin.deviceId,
    1,
  );
  await call.env.posix.symlink(await posixScopeOf(call), {
    parent: await parentInodeOf(call, drivePath),
    name: basename(drivePath),
    ino: lease.start,
    target,
    uid: null,
    gid: null,
    opKey: OP_KEY,
  });
  return created(call, drivePath);
}

export async function createHardLink(
  call: SyncCall,
  source: DriveItem,
  drivePath: string,
): Promise<DriveItem> {
  await call.env.posix.link(await posixScopeOf(call), {
    ino: (await inodeOf(call.env, source.rootId, source)).id,
    parent: await parentInodeOf(call, drivePath),
    name: basename(drivePath),
    opKey: OP_KEY,
  });
  return created(call, drivePath);
}

function attributesRequest(
  inode: DriveInode,
  item: DriveItem,
  wanted: WantedMeta,
): RequestMeta<'SETATTR'> | null {
  const mode = item.kind !== 'link' && inode.mode !== wanted.mode;
  const mtime = inode.mtimeNs !== BigInt(wanted.mtimeNs);
  if (!mode && !mtime) return null;
  return {
    ino: inode.id,
    valid: (mode ? SETATTR_VALID.mode : 0) | (mtime ? SETATTR_VALID.mtime : 0),
    ...(mode ? { mode: wanted.mode } : {}),
    ...(mtime ? { mtime: BigInt(wanted.mtimeNs) } : {}),
    opKey: OP_KEY,
  };
}

async function applyXattrs(
  env: SyncEnv,
  ps: PosixScope,
  inodeId: number,
  xattrs: readonly SyncXattr[],
): Promise<boolean> {
  const wanted = new Map(xattrs.map((xattr) => [xattr.name, Buffer.from(xattr.value, 'base64')]));
  const { names } = await env.posix.listxattr(ps, inodeId);
  let changed = false;
  for (const name of names) {
    if (wanted.has(name)) continue;
    await env.posix.removexattr(ps, { ino: inodeId, name, opKey: OP_KEY });
    changed = true;
  }
  for (const [name, value] of wanted) {
    const held = await env.store.host.call('driveXattrs', 'get', inodeId, name);
    if (held !== undefined && Buffer.from(held).equals(value)) continue;
    await env.posix.setxattr(ps, { ino: inodeId, name, flags: NO_FLAGS, opKey: OP_KEY }, value);
    changed = true;
  }
  return changed;
}

export function announceChange(env: SyncEnv, origin: Origin, item: DriveItem): Promise<void> {
  return env.store.host.write('driveSyncAnnounce', { itemId: item.id, actor: syncActor(origin) });
}

export async function applyMeta(
  call: SyncCall,
  item: DriveItem,
  wanted: WantedMeta,
): Promise<void> {
  const { env, origin } = call;
  const ps = await posixScopeOf(call);
  const inode = await inodeOf(env, item.rootId, item);
  const request = attributesRequest(inode, item, wanted);
  if (request !== null) await env.posix.setattr(ps, request);
  if (item.kind === 'link') return;
  if (await applyXattrs(env, ps, inode.id, wanted.xattrs)) await announceChange(env, origin, item);
}
