import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import {
  decideMove,
  decideTombstone,
  packedToBytes,
  unpackHashes,
  type HubEntry,
} from '@smarteverything/domain/drive-sync';
import { ApiError } from '@smarteverything/domain';
import { parentIn, type ChangeActor } from '../changes';
import { locate, moveWithin, tmpRelPath, TMP_DIRECTORY, type DriveWriteRoot } from '../intents';
import { assertWritable, syncScopeOf, type SyncScope } from './placement-scope';
import { inScope, toDrivePath } from './sync-paths';
import { commitTrash } from '../trash-purge';
import { hardLink, pushLink, pushMeta, type Reply } from './server-links';
import { pathReason } from './server-paths';
import { fillFromHub, hubEntryOf, SyncBlockRoutes } from './server-blocks';
import { discardTxn, ensureFolders, planOf, SyncCommitter } from './server-commit';
import { blocksHashOf } from './server-index';
import { fileOf } from './file-of';
import {
  acceptOf,
  apiErrorOf,
  conflictOf,
  recall,
  remember,
  RootQueues,
  SyncTxn,
  SyncTxns,
  syncActor,
  type ConflictMessage,
  type NeedBlocksMessage,
  type SyncEnv,
  type TxnSpec,
} from './server-ops';
import type { SyncOperation, SyncOperations, SyncSession } from './server-socket';

type Push = Extract<SyncOperation, { readonly type: 'push' }>;
type Move = Extract<SyncOperation, { readonly type: 'move' }>;
type Tombstone = Extract<SyncOperation, { readonly type: 'tombstone' }>;

function verifiedBlocks(message: Push): readonly string[] {
  const hashes = unpackHashes(message.blocks);
  if (blocksHashOf(packedToBytes(message.blocks)) !== message.meta.blocksHash) {
    throw new ApiError('invalid_request', 'The block list does not match its checksum.');
  }
  return hashes;
}

async function createTmp(env: SyncEnv, root: DriveWriteRoot, spec: TxnSpec): Promise<void> {
  await env.files.mkdir(await locate(root, TMP_DIRECTORY));
  const handle = await open(await locate(root, spec.tmpRel), 'wx', 0o600);
  try {
    await handle.truncate(spec.meta.bytes);
  } finally {
    await handle.close();
  }
}

function entryAt(item: DriveItem | undefined): HubEntry | undefined {
  return item === undefined ? undefined : { rev: item.rev, deleted: false, content: '', seq: 0 };
}

export class DriveSyncOperations implements SyncOperations {
  constructor(
    private readonly env: SyncEnv,
    private readonly txns: SyncTxns,
    private readonly committer: SyncCommitter,
    private readonly queues: RootQueues,
  ) {}

  handle(session: SyncSession, message: SyncOperation): Promise<void> {
    return this.dispatch(session, message).catch((cause: unknown) => {
      throw apiErrorOf(cause) ?? cause;
    });
  }

  async release(deviceId: string): Promise<void> {
    for (const txn of this.txns.ofDevice(deviceId)) {
      await discardTxn(this.env, this.txns, txn);
    }
  }

  private dispatch(session: SyncSession, message: SyncOperation): Promise<void> {
    switch (message.type) {
      case 'push':
        return this.answer(session, message.opId, (scope) => this.push(session, scope, message));
      case 'push_meta':
        return this.answer(session, message.opId, (scope) =>
          pushMeta({ env: this.env, origin: session, scope }, message),
        );
      case 'push_link':
        return this.answer(session, message.opId, (scope) =>
          pushLink({ env: this.env, origin: session, scope }, message),
        );
      case 'move':
        return this.answer(session, message.opId, (scope) => this.move(session, scope, message));
      case 'tombstone':
        return this.answer(session, message.opId, (scope) =>
          this.tombstone(session, scope, message),
        );
      case 'commit':
        return this.commit(session, message.txn, message.opId);
    }
  }

  private async commit(session: SyncSession, txn: string, opId: string): Promise<void> {
    const known = await recall(this.env, session, opId);
    await session.send(known ?? (await this.committer.commit(session, txn, opId)));
  }

  private answer(
    session: SyncSession,
    opId: string,
    work: (scope: SyncScope) => Promise<Reply>,
  ): Promise<void> {
    return this.queues.run(session.rootId, async () => {
      const known = await recall(this.env, session, opId);
      if (known !== null) {
        await session.send(known);
        return;
      }
      const scope = await syncScopeOf(
        this.env.store,
        session.placementId,
        session.deviceId,
        session.mode,
      );
      assertWritable(scope);
      const reply = await work(scope);
      if (reply.type !== 'need_blocks') await remember(this.env, session, reply);
      await session.send(reply);
    });
  }

  private async pushRefusal(
    scope: SyncScope,
    message: Push,
    existing: DriveItem | undefined,
  ): Promise<ConflictMessage | null> {
    const reason = await pathReason(this.env, scope, message.relPath);
    if (reason !== null) return conflictOf(message.opId, reason, existing?.rev ?? 0, null);
    if (message.linkOf === null && existing !== undefined && fileOf(existing) === null) {
      return conflictOf(message.opId, 'exists', existing.rev, null);
    }
    return null;
  }

  private async push(session: SyncSession, scope: SyncScope, message: Push): Promise<Reply> {
    const { env } = this;
    const root = scope.drive;
    const hashes = verifiedBlocks(message);
    const relPath = toDrivePath(scope, message.relPath);
    const existing = await env.store.host.call('driveItems', 'byPath', root.id, relPath, null);
    const refused = await this.pushRefusal(scope, message, existing);
    if (refused !== null) return refused;
    if (message.linkOf !== null) {
      const call = { env, origin: session, scope };
      return hardLink(call, { message, linkOf: message.linkOf, existing });
    }
    const file = existing === undefined ? null : fileOf(existing);
    const plan = planOf(file, await hubEntryOf(env, root, existing), message);
    if (plan.kind === 'noop') return acceptOf(env, root.id, message.opId, plan.rev);
    if (plan.kind === 'conflict' && scope.placement.conflictCopies !== true) {
      return conflictOf(message.opId, 'stale', plan.hub.rev, null);
    }
    return this.open(session, root, { message, relPath, hashes, existing });
  }

  private async open(
    session: SyncSession,
    root: DriveWriteRoot,
    push: {
      readonly message: Push;
      readonly relPath: string;
      readonly hashes: readonly string[];
      readonly existing?: DriveItem | undefined;
    },
  ): Promise<NeedBlocksMessage> {
    const { env, txns } = this;
    const { message } = push;
    const spec: TxnSpec = {
      placementId: session.placementId,
      deviceId: session.deviceId,
      profileId: session.profileId,
      id: randomUUID(),
      opId: message.opId,
      rootId: root.id,
      relPath: push.relPath,
      baseRev: message.baseRev,
      meta: message.meta,
      mode: message.mode,
      xattrs: message.xattrs,
      hashes: push.hashes,
      tmpRel: tmpRelPath(),
    };
    await createTmp(env, root, spec);
    const txn = new SyncTxn(spec, [...spec.hashes.keys()]);
    const earlier = txns.open(txn);
    if (earlier !== undefined) await discardTxn(env, txns, earlier);
    try {
      const indexes = await fillFromHub(env, root, txn, push.existing);
      txn.want(indexes);
      return { type: 'need_blocks', opId: spec.opId, txn: spec.id, indexes };
    } catch (cause) {
      await discardTxn(env, txns, txn);
      throw cause;
    }
  }

  private async move(session: SyncSession, scope: SyncScope, message: Move): Promise<Reply> {
    const { env } = this;
    const root = scope.drive;
    const fromPath = toDrivePath(scope, message.from);
    const toPath = toDrivePath(scope, message.to);
    const from = inScope(scope, fromPath)
      ? await env.store.host.call('driveItems', 'byPath', root.id, fromPath, null)
      : undefined;
    if (from === undefined) return conflictOf(message.opId, 'missing', 0, null);
    const refused = await this.moveRefused(scope, message, from, toPath);
    if (refused !== null) return refused;
    const actor = syncActor(session);
    await ensureFolders(env, root, toPath, actor);
    await this.relocate(root, from, toPath, actor);
    const moved = await env.store.host.call('driveItems', 'byId', from.id, null);
    return acceptOf(env, root.id, message.opId, moved.rev);
  }

  private async moveRefused(
    scope: SyncScope,
    message: Move,
    from: DriveItem,
    toPath: string,
  ): Promise<ConflictMessage | null> {
    const { env } = this;
    const root = scope.drive;
    const inside = from.kind === 'folder' && toPath.startsWith(`${from.relPath}/`);
    if (inside || (await pathReason(env, scope, message.to)) !== null) {
      return conflictOf(message.opId, 'path', from.rev, null);
    }
    const to = await env.store.host.call('driveItems', 'byPath', root.id, toPath, null);
    if (decideMove(entryAt(from), entryAt(to), message) === 'conflict') {
      const reason = from.rev === message.baseRev ? 'exists' : 'stale';
      return conflictOf(message.opId, reason, from.rev, null);
    }
    const occupied = await env.files.stamp(await locate(root, toPath));
    return occupied === null ? null : conflictOf(message.opId, 'exists', from.rev, null);
  }

  private async relocate(
    root: DriveWriteRoot,
    from: DriveItem,
    relPath: string,
    actor: ChangeActor,
  ): Promise<void> {
    const { env } = this;
    const carried = await env.store.host.read('driveSyncCarriedBlocks', from);
    await moveWithin(env.files, root, { from: from.relPath, to: relPath, mode: 'keep' });
    try {
      await env.store.host.write('driveSyncRelocate', {
        item: from,
        target: {
          parentId: (await parentIn(env, root.id, relPath))?.id ?? null,
          relPath,
          name: basename(relPath),
        },
        change: { op: dirname(from.relPath) === dirname(relPath) ? 'rename' : 'move', actor },
        carried,
      });
    } catch (cause) {
      await moveWithin(env.files, root, { from: relPath, to: from.relPath, mode: 'keep' });
      throw cause;
    }
  }

  private async holdsItems(folder: DriveItem): Promise<boolean> {
    const { entries } = await this.env.store.host.call('driveItems', 'children', {
      rootId: folder.rootId,
      parentId: folder.id,
      after: null,
      limit: 1,
      viewer: null,
    });
    return entries.length > 0;
  }

  private async tombstone(
    session: SyncSession,
    scope: SyncScope,
    message: Tombstone,
  ): Promise<Reply> {
    const { env } = this;
    const root = scope.drive;
    const relPath = toDrivePath(scope, message.relPath);
    if (!inScope(scope, relPath)) return conflictOf(message.opId, 'path', 0, null);
    const item = await env.store.host.call('driveItems', 'byPath', root.id, relPath, null);
    const decision = decideTombstone(entryAt(item), message.baseRev);
    if (decision === 'noop' || item === undefined) return acceptOf(env, root.id, message.opId, 0);
    if (decision === 'stale' || (item.kind === 'folder' && (await this.holdsItems(item)))) {
      return conflictOf(message.opId, 'stale', item.rev, null);
    }
    await commitTrash(env, root, item.id, syncActor(session));
    return acceptOf(env, root.id, message.opId, item.rev + 1);
  }
}

export interface DriveSyncParts {
  readonly operations: DriveSyncOperations;
  readonly blocks: SyncBlockRoutes;
  readonly commits: SyncCommitter;
}

export function createDriveSync(env: SyncEnv): DriveSyncParts {
  const txns = new SyncTxns();
  const queues = new RootQueues();
  const commits = new SyncCommitter(env, txns, queues);
  return {
    operations: new DriveSyncOperations(env, txns, commits, queues),
    blocks: new SyncBlockRoutes(env, txns),
    commits,
  };
}
