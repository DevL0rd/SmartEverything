import type { IncomingMessage, ServerResponse } from 'node:http';
import { utimes } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import {
  decidePush,
  packHashes,
  packedToBytes,
  type HubEntry,
} from '@smarteverything/domain/drive-sync';
import { sendJson } from '../../server/http';
import {
  folderDraft,
  identityOf,
  isoOf,
  parentOf,
  recordItem,
  commitContent,
  type ChangeActor,
} from '../changes';
import { commitConflictCopy, type ConflictEnv } from '../conflicts';
import { DriveWriteError, locate, type DriveWriteRoot } from '../intents';
import { checkDriveWrite } from '../quotas';
import type { StagedBytes } from '../versions';
import {
  assertWritable,
  inScope,
  resolveScope,
  toWirePath,
  type SyncScope,
} from './placement-scope';
import {
  contentToken,
  guarded,
  hubEntryOf,
  nodeOf,
  txnById,
  verifyAssembled,
  type Assembled,
} from './server-blocks';
import {
  acceptOf,
  conflictOf,
  fileOf,
  remember,
  syncActor,
  type AcceptMessage,
  type ConflictMessage,
  type NeedBlocksMessage,
  type RootQueues,
  type SyncEnv,
  type SyncNode,
  type SyncTxn,
  type SyncTxns,
  type TxnSpec,
} from './server-ops';

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

const NO_BASE_REV = 1;

export type CommitResult = AcceptMessage | ConflictMessage | NeedBlocksMessage;

export type Plan =
  | { readonly kind: 'noop'; readonly rev: number }
  | { readonly kind: 'replace'; readonly file: FileItem | null }
  | { readonly kind: 'conflict'; readonly hub: FileItem };

export function planOf(
  file: FileItem | null,
  entry: HubEntry | undefined,
  request: Pick<TxnSpec, 'baseRev' | 'meta'>,
): Plan {
  const { bytes, blockSize, blocksHash } = request.meta;
  const decision = decidePush(entry, request.baseRev, contentToken(bytes, blockSize, blocksHash));
  if (file !== null && decision === 'noop') return { kind: 'noop', rev: file.rev };
  if (file !== null && decision === 'conflict') return { kind: 'conflict', hub: file };
  return { kind: 'replace', file };
}

async function makeFolder(
  env: SyncEnv,
  root: DriveWriteRoot,
  relPath: string,
  actor: ChangeActor,
): Promise<void> {
  const path = await locate(root, relPath);
  await env.files.mkdir(path);
  const stamp = await env.files.stamp(path);
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The new folder is missing after it was made.');
  }
  recordItem(env, {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: parentOf(env, root.id, relPath)?.id ?? null,
        relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: env.now().toISOString(),
        outside: false,
        addedByProfileId: actor.actorProfileId,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor,
  });
}

export async function ensureFolders(
  env: SyncEnv,
  root: DriveWriteRoot,
  relPath: string,
  actor: ChangeActor,
): Promise<void> {
  const folder = dirname(relPath);
  let prefix = '';
  for (const part of folder === '.' ? [] : folder.split('/')) {
    prefix = prefix === '' ? part : `${prefix}/${part}`;
    if (env.store.driveItems.byPath(root.id, prefix, null) === undefined) {
      await makeFolder(env, root, prefix, actor);
    }
  }
}

export async function discardTxn(env: SyncEnv, txns: SyncTxns, txn: SyncTxn): Promise<void> {
  txns.drop(txn);
  const row = env.store.driveRoots.find(txn.spec.rootId);
  if (row === undefined) return;
  await env.files.remove(await locate(row, txn.spec.tmpRel));
}

function carryBlocks(env: SyncEnv, spec: TxnSpec): (item: DriveItem) => void {
  const hashes = packedToBytes(packHashes(spec.hashes));
  return (item) => {
    env.store.driveBlocks.put({
      itemId: item.id,
      rev: item.rev,
      blockSize: spec.meta.blockSize,
      hashes,
    });
    env.store.driveBlocks.removeBefore(item.id, item.rev);
  };
}

function copyEnv(env: SyncEnv, spec: TxnSpec): ConflictEnv {
  const carry = carryBlocks(env, spec);
  return {
    ...env,
    conflicts: {
      insert: (conflict): void => {
        env.conflicts.insert(conflict);
        carry(env.store.driveItems.byId(conflict.conflictItemId, null));
      },
      find: (id) => env.conflicts.find(id),
      resolve: (id, resolution, at) => env.conflicts.resolve(id, resolution, at),
    },
  };
}

function absentOf(txn: SyncTxn): readonly number[] {
  return txn.spec.hashes.flatMap((_, index) => (txn.hasArrived(index) ? [] : [index]));
}

export class SyncCommitter {
  constructor(
    private readonly env: SyncEnv,
    private readonly txns: SyncTxns,
    private readonly queues: RootQueues,
  ) {}

  commit(
    who: Pick<SyncNode, 'deviceId' | 'profileId'>,
    txnId: string,
    opId: string | null,
  ): Promise<CommitResult> {
    const txn = txnById(this.txns, txnId, who);
    if (opId !== null && opId !== txn.spec.opId) {
      throw new ApiError(
        'invalid_request',
        'The commit names a different operation than the push.',
      );
    }
    return this.queues.run(txn.spec.rootId, () => this.run(txn));
  }

  http(
    request: IncomingMessage,
    response: ServerResponse,
    params: Readonly<Record<string, string>>,
  ): Promise<void> {
    return guarded(response, async () => {
      const result = await this.commit(nodeOf(this.env, request), params['txn'] ?? '', null);
      sendJson(response, 200, result);
    });
  }

  private async run(txn: SyncTxn): Promise<CommitResult> {
    if (!txn.lockCommit()) {
      throw new ApiError('conflict', 'A block is still arriving or the commit is already running.');
    }
    try {
      const absent = absentOf(txn);
      if (absent.length > 0) {
        txn.want(absent);
        return { type: 'need_blocks', opId: txn.spec.opId, txn: txn.spec.id, indexes: absent };
      }
      return await this.settle(txn);
    } finally {
      txn.unlockCommit();
    }
  }

  private async settle(txn: SyncTxn): Promise<CommitResult> {
    try {
      const result = await this.apply(txn);
      remember(this.env, txn.spec, result);
      return result;
    } finally {
      await discardTxn(this.env, this.txns, txn);
    }
  }

  private async apply(txn: SyncTxn): Promise<AcceptMessage | ConflictMessage> {
    const { spec } = txn;
    const scope = resolveScope(this.env.store, spec.placementId, spec.deviceId, 'sync');
    assertWritable(scope);
    const root = scope.drive;
    if (!inScope(scope, spec.relPath)) {
      return conflictOf(spec.opId, 'path', 0, null);
    }
    const existing = this.env.store.driveItems.byPath(spec.rootId, spec.relPath, null);
    const file = existing === undefined ? null : fileOf(existing);
    if (existing !== undefined && file === null) {
      return conflictOf(spec.opId, 'exists', existing.rev, null);
    }
    const plan = planOf(file, await hubEntryOf(this.env, root, existing), spec);
    if (plan.kind === 'noop') return acceptOf(this.env, spec.rootId, spec.opId, plan.rev);
    const assembled = await verifyAssembled(root, txn);
    if (plan.kind === 'replace') return this.replace(txn, root, plan.file, assembled);
    if (scope.placement.conflictCopies !== true) {
      return conflictOf(spec.opId, 'stale', plan.hub.rev, null);
    }
    return this.copy(txn, scope, plan.hub, assembled);
  }

  private async admit(
    root: DriveWriteRoot,
    spec: TxnSpec,
    assembled: Assembled,
    releasedBytes: number,
  ): Promise<void> {
    await checkDriveWrite(
      {
        status: (profileId) => this.env.store.driveQuotas.status(profileId),
        space: this.env.space,
      },
      { profileId: spec.profileId, addBytes: assembled.bytes, releasedBytes, path: root.path },
    );
  }

  private async staged(
    root: DriveWriteRoot,
    spec: TxnSpec,
    assembled: Assembled,
  ): Promise<StagedBytes> {
    const when = new Date(spec.meta.mtime);
    await utimes(await locate(root, spec.tmpRel), when, when);
    return { relPath: spec.tmpRel, bytes: assembled.bytes, sha256: assembled.sha256 };
  }

  private async replace(
    txn: SyncTxn,
    root: DriveWriteRoot,
    hub: FileItem | null,
    assembled: Assembled,
  ): Promise<AcceptMessage | ConflictMessage> {
    const { spec } = txn;
    const actor = syncActor(spec);
    await this.admit(root, spec, assembled, hub?.bytes ?? 0);
    try {
      await ensureFolders(this.env, root, spec.relPath, actor);
      const written = await commitContent(this.env, {
        root,
        staged: await this.staged(root, spec, assembled),
        relPath: spec.relPath,
        actor,
        alongside: carryBlocks(this.env, spec),
      });
      return acceptOf(this.env, spec.rootId, spec.opId, written.item.rev);
    } catch (cause) {
      if (cause instanceof DriveWriteError && cause.failure === 'exists') {
        return conflictOf(spec.opId, 'exists', hub?.rev ?? 0, null);
      }
      throw cause;
    }
  }

  private async copy(
    txn: SyncTxn,
    scope: SyncScope,
    hub: FileItem,
    assembled: Assembled,
  ): Promise<ConflictMessage> {
    const { spec } = txn;
    const root = scope.drive;
    await this.admit(root, spec, assembled, 0);
    const conflict = await commitConflictCopy(copyEnv(this.env, spec), {
      hub,
      staged: await this.staged(root, spec, assembled),
      baseRev: Math.max(spec.baseRev ?? NO_BASE_REV, NO_BASE_REV),
      deviceId: spec.deviceId,
      actor: syncActor(spec),
    });
    return conflictOf(spec.opId, 'stale', hub.rev, toWirePath(scope, conflict.conflictRelPath));
  }
}
