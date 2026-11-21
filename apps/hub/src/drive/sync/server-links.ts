import type { DriveItem } from '@smarteverything/domain';
import { PosixError } from '../posix/errors';
import { inScope, toDrivePath } from './sync-paths';
import { blocksOf } from './server-blocks';
import { ensureFolders } from './server-commit';
import { applyMeta, createHardLink, createSymlink, inodeOf, type SyncCall } from './server-meta';
import { fileOf } from './file-of';
import {
  acceptOf,
  conflictOf,
  syncActor,
  type AcceptMessage,
  type ConflictMessage,
  type ConflictReason,
  type NeedBlocksMessage,
} from './server-ops';
import { pathReason } from './server-paths';
import type { SyncOperation } from './server-socket';

export type Reply = AcceptMessage | ConflictMessage | NeedBlocksMessage;

type Push = Extract<SyncOperation, { readonly type: 'push' }>;
type PushMeta = Extract<SyncOperation, { readonly type: 'push_meta' }>;
type PushLink = Extract<SyncOperation, { readonly type: 'push_link' }>;

const LINK_CONFLICTS: Readonly<Record<string, ConflictReason>> = {
  EEXIST: 'exists',
  ENOENT: 'missing',
  ENOTDIR: 'path',
  EPERM: 'path',
  EXDEV: 'path',
  ELOOP: 'path',
  EINVAL: 'path',
  ENAMETOOLONG: 'path',
};

function linkRefusal(opId: string, cause: unknown, hubRev: number): ConflictMessage | null {
  if (!(cause instanceof PosixError)) return null;
  const reason = LINK_CONFLICTS[cause.code];
  return reason === undefined ? null : conflictOf(opId, reason, hubRev, null);
}

async function attempt(opId: string, hubRev: number, work: () => Promise<Reply>): Promise<Reply> {
  try {
    return await work();
  } catch (cause) {
    const refused = linkRefusal(opId, cause, hubRev);
    if (refused === null) throw cause;
    return refused;
  }
}

export interface HardLink {
  readonly message: Push;
  readonly linkOf: string;
  readonly existing: DriveItem | undefined;
}

async function sourceOf(call: SyncCall, linkOf: string): Promise<DriveItem | undefined> {
  const { env, scope } = call;
  const sourcePath = toDrivePath(scope, linkOf);
  return inScope(scope, sourcePath)
    ? await env.store.host.call('driveItems', 'byPath', scope.drive.id, sourcePath, null)
    : undefined;
}

async function nameSource(call: SyncCall, source: DriveItem, made: DriveItem): Promise<void> {
  const { env, scope } = call;
  const file = fileOf(source);
  if (file === null) return;
  const { blockSize, hashes } = await blocksOf(env, scope.drive, file);
  await env.store.host.write('driveSyncLinkBlocks', {
    blocks: { itemId: made.id, rev: made.rev, blockSize, hashes },
    actor: syncActor(call.origin),
  });
}

export async function hardLink(call: SyncCall, push: HardLink): Promise<Reply> {
  const { env, scope, origin } = call;
  const { message, existing } = push;
  const source = await sourceOf(call, push.linkOf);
  if (source === undefined) return conflictOf(message.opId, 'missing', 0, null);
  if (source.kind === 'folder' || source.kind === 'special') {
    return conflictOf(message.opId, 'path', source.rev, null);
  }
  if (existing !== undefined) {
    const [held, linked] = await Promise.all([
      inodeOf(env, scope.drive.id, existing),
      inodeOf(env, scope.drive.id, source),
    ]);
    return held.id === linked.id
      ? acceptOf(env, scope.drive.id, message.opId, existing.rev)
      : conflictOf(message.opId, 'exists', existing.rev, null);
  }
  const relPath = toDrivePath(scope, message.relPath);
  await ensureFolders(env, scope.drive, relPath, syncActor(origin));
  return attempt(message.opId, source.rev, async () => {
    const made = await createHardLink(call, source, relPath);
    await nameSource(call, source, made);
    return acceptOf(env, scope.drive.id, message.opId, made.rev);
  });
}

export async function pushMeta(call: SyncCall, message: PushMeta): Promise<Reply> {
  const { env, scope } = call;
  const relPath = toDrivePath(scope, message.relPath);
  if (!inScope(scope, relPath)) return conflictOf(message.opId, 'path', 0, null);
  const item = await env.store.host.call('driveItems', 'byPath', scope.drive.id, relPath, null);
  if (item === undefined) return conflictOf(message.opId, 'missing', 0, null);
  if (item.kind === 'link' || item.kind === 'special') {
    return conflictOf(message.opId, 'path', item.rev, null);
  }
  if (item.rev !== message.baseRev) return conflictOf(message.opId, 'stale', item.rev, null);
  await applyMeta(call, item, message);
  return acceptOf(env, scope.drive.id, message.opId, item.rev);
}

async function refusedLink(
  call: SyncCall,
  message: PushLink,
  existing: DriveItem | undefined,
): Promise<Reply | null> {
  const { env, scope } = call;
  const reason = await pathReason(env, scope, message.relPath);
  if (reason !== null) return conflictOf(message.opId, reason, existing?.rev ?? 0, null);
  if (existing?.kind === 'link' && existing.linkTarget === message.target) {
    return acceptOf(env, scope.drive.id, message.opId, existing.rev);
  }
  return existing === undefined ? null : conflictOf(message.opId, 'exists', existing.rev, null);
}

export async function pushLink(call: SyncCall, message: PushLink): Promise<Reply> {
  const { env, scope, origin } = call;
  const relPath = toDrivePath(scope, message.relPath);
  const existing = inScope(scope, relPath)
    ? await env.store.host.call('driveItems', 'byPath', scope.drive.id, relPath, null)
    : undefined;
  const refused = await refusedLink(call, message, existing);
  if (refused !== null) return refused;
  await ensureFolders(env, scope.drive, relPath, syncActor(origin));
  return attempt(message.opId, 0, async () => {
    const made = await createSymlink(call, relPath, message.target);
    return acceptOf(env, scope.drive.id, message.opId, made.rev);
  });
}
