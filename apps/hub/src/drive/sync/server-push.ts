import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import {
  checkSyncPath,
  collidesWith,
  decideMove,
  decideTombstone,
  packedToBytes,
  unpackHashes,
  type HubEntry,
} from '@smarteverything/domain/drive-sync';
import { ApiError } from '@smarteverything/domain';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import { repathItem } from '../service-write-repath';
import { parentOf, type ChangeActor } from '../changes';
import { locate, moveWithin, tmpRelPath, TMP_DIRECTORY, type DriveWriteRoot } from '../intents';
import { DRIVE_PAGE_SIZE } from '../service-read';
import {
  assertWritable,
  inScope,
  resolveScope,
  toDrivePath,
  type SyncScope,
} from './placement-scope';
import { commitTrash } from '../trash-purge';
import { fillFromHub, hubEntryOf, SyncBlockRoutes } from './server-blocks';
import { discardTxn, ensureFolders, planOf, SyncCommitter } from './server-commit';
import { blocksHashOf } from './server-index';
import {
  acceptOf,
  apiErrorOf,
  conflictOf,
  fileOf,
  recall,
  remember,
  RootQueues,
  SyncTxn,
  SyncTxns,
  syncActor,
  type AcceptMessage,
  type ConflictMessage,
  type ConflictReason,
  type NeedBlocksMessage,
  type SyncEnv,
  type TxnSpec,
} from './server-ops';
import type { SyncOperation, SyncOperations, SyncSession } from './server-socket';

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;
type Reply = AcceptMessage | ConflictMessage | NeedBlocksMessage;
type Push = Extract<SyncOperation, { readonly type: 'push' }>;
type Move = Extract<SyncOperation, { readonly type: 'move' }>;
type Tombstone = Extract<SyncOperation, { readonly type: 'tombstone' }>;

const PORTABLE_OS = /windows|mac|darwin/iu;

function portableRoot(env: SyncEnv, rootId: string): boolean {
  return env.store.drivePlacements
    .forRoot(rootId)
    .filter((placement) => placement.mode === 'synced' && placement.enabled)
    .some((placement) => {
      const os = env.store.devices.find(placement.deviceId)?.details['os'];
      return typeof os === 'string' && PORTABLE_OS.test(os);
    });
}

function* namesIn(env: SyncEnv, rootId: string, parent: DriveItem | null): Generator<string> {
  let after: string | null = null;
  do {
    const window = env.store.driveItems.children({
      rootId,
      parentId: parent?.id ?? null,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const { item } of window.entries) yield item.name;
    after = window.next;
  } while (after !== null);
}

function ancestryReason(
  env: SyncEnv,
  rootId: string,
  relPath: string,
  portable: boolean,
): ConflictReason | null {
  const segments = relPath.split('/');
  let parent: DriveItem | null = null;
  let prefix = '';
  for (const [at, segment] of segments.entries()) {
    if (portable && collidesWith(segment, namesIn(env, rootId, parent)) !== null) return 'path';
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    const next = env.store.driveItems.byPath(rootId, prefix, null);
    if (next === undefined) return null;
    if (at < segments.length - 1 && next.kind !== 'folder') return 'exists';
    parent = next;
  }
  return null;
}

function pathReason(env: SyncEnv, scope: SyncScope, wirePath: string): ConflictReason | null {
  const rootId = scope.drive.id;
  const portable = portableRoot(env, rootId);
  const drivePath = toDrivePath(scope, wirePath);
  if (!inScope(scope, drivePath) || !checkSyncPath(wirePath, { portable }).ok) return 'path';
  return ancestryReason(env, rootId, drivePath, portable);
}

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

function* filesUnder(env: SyncEnv, item: DriveItem): Generator<FileItem> {
  const file = fileOf(item);
  if (file !== null) {
    yield file;
    return;
  }
  let after: string | null = null;
  do {
    const window = env.store.driveItems.children({
      rootId: item.rootId,
      parentId: item.id,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const { item: child } of window.entries) yield* filesUnder(env, child);
    after = window.next;
  } while (after !== null);
}

function carriedBlocks(env: SyncEnv, item: DriveItem): readonly DriveBlocks[] {
  return [...filesUnder(env, item)].flatMap((file) => {
    const blocks = env.store.driveBlocks.find(file.id, file.rev);
    return blocks === undefined ? [] : [blocks];
  });
}

function reattach(env: SyncEnv, carried: readonly DriveBlocks[]): void {
  for (const blocks of carried) {
    const now = env.store.driveItems.find(blocks.itemId, null);
    if (now === undefined || now.rev === blocks.rev) continue;
    env.store.driveBlocks.put({ ...blocks, rev: now.rev });
    env.store.driveBlocks.removeBefore(now.id, now.rev);
  }
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
    const known = recall(this.env, session, opId);
    await session.send(known ?? (await this.committer.commit(session, txn, opId)));
  }

  private answer(
    session: SyncSession,
    opId: string,
    work: (scope: SyncScope) => Promise<Reply>,
  ): Promise<void> {
    return this.queues.run(session.rootId, async () => {
      const known = recall(this.env, session, opId);
      if (known !== null) {
        await session.send(known);
        return;
      }
      const scope = resolveScope(
        this.env.store,
        session.placementId,
        session.deviceId,
        session.mode,
      );
      assertWritable(scope);
      const reply = await work(scope);
      if (reply.type !== 'need_blocks') remember(this.env, session, reply);
      await session.send(reply);
    });
  }

  private async push(session: SyncSession, scope: SyncScope, message: Push): Promise<Reply> {
    const { env } = this;
    const root = scope.drive;
    const hashes = verifiedBlocks(message);
    const relPath = toDrivePath(scope, message.relPath);
    const existing = env.store.driveItems.byPath(root.id, relPath, null);
    const reason = pathReason(env, scope, message.relPath);
    if (reason !== null) return conflictOf(message.opId, reason, existing?.rev ?? 0, null);
    if (existing?.kind === 'folder') return conflictOf(message.opId, 'exists', existing.rev, null);
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
      ? env.store.driveItems.byPath(root.id, fromPath, null)
      : undefined;
    if (from === undefined) return conflictOf(message.opId, 'missing', 0, null);
    const refused = await this.moveRefused(scope, message, from, toPath);
    if (refused !== null) return refused;
    const actor = syncActor(session);
    await ensureFolders(env, root, toPath, actor);
    await this.relocate(root, from, toPath, actor);
    return acceptOf(env, root.id, message.opId, env.store.driveItems.byId(from.id, null).rev);
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
    if (inside || pathReason(env, scope, message.to) !== null) {
      return conflictOf(message.opId, 'path', from.rev, null);
    }
    const to = env.store.driveItems.byPath(root.id, toPath, null);
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
    const carried = carriedBlocks(env, from);
    await moveWithin(env.files, root, { from: from.relPath, to: relPath, mode: 'keep' });
    try {
      env.store.write(() => {
        repathItem(
          env,
          from,
          {
            parentId: parentOf(env, root.id, relPath)?.id ?? null,
            relPath,
            name: basename(relPath),
          },
          { op: dirname(from.relPath) === dirname(relPath) ? 'rename' : 'move', actor },
        );
        reattach(env, carried);
      });
    } catch (cause) {
      await moveWithin(env.files, root, { from: relPath, to: from.relPath, mode: 'keep' });
      throw cause;
    }
  }

  private holdsItems(folder: DriveItem): boolean {
    const { entries } = this.env.store.driveItems.children({
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
    const item = env.store.driveItems.byPath(root.id, relPath, null);
    const decision = decideTombstone(entryAt(item), message.baseRev);
    if (decision === 'noop' || item === undefined) return acceptOf(env, root.id, message.opId, 0);
    if (decision === 'stale' || (item.kind === 'folder' && this.holdsItems(item))) {
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
