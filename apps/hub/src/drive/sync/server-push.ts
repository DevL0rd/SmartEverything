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
import {
  assertWritable,
  locate,
  moveWithin,
  physicalRoot,
  tmpRelPath,
  TMP_DIRECTORY,
  type DriveWriteRoot,
} from '../intents';
import { DRIVE_PAGE_SIZE } from '../service-read';
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
  return env.store.driveSyncClients
    .forRoot(rootId)
    .filter((client) => client.enabled)
    .some((client) => {
      const os = env.store.devices.find(client.deviceId)?.details['os'];
      return typeof os === 'string' && PORTABLE_OS.test(os);
    });
}

function* namesIn(env: SyncEnv, rootId: string, parent: DriveItem | null): Generator<string> {
  let after: string | null = null;
  do {
    const window = env.store.driveItems.children(
      rootId,
      parent?.id ?? null,
      after,
      DRIVE_PAGE_SIZE,
    );
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
    const next = env.store.driveItems.byPath(rootId, prefix);
    if (next === undefined) return null;
    if (at < segments.length - 1 && next.kind !== 'folder') return 'exists';
    parent = next;
  }
  return null;
}

function pathReason(env: SyncEnv, rootId: string, relPath: string): ConflictReason | null {
  const portable = portableRoot(env, rootId);
  if (!checkSyncPath(relPath, { portable }).ok) return 'path';
  return ancestryReason(env, rootId, relPath, portable);
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
    const window = env.store.driveItems.children(item.rootId, item.id, after, DRIVE_PAGE_SIZE);
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
    const now = env.store.driveItems.find(blocks.itemId);
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
        return this.answer(session, message.opId, (root) => this.push(session, root, message));
      case 'move':
        return this.answer(session, message.opId, (root) => this.move(session, root, message));
      case 'tombstone':
        return this.answer(session, message.opId, (root) => this.tombstone(session, root, message));
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
    work: (root: DriveWriteRoot) => Promise<Reply>,
  ): Promise<void> {
    return this.queues.run(session.rootId, async () => {
      const known = recall(this.env, session, opId);
      if (known !== null) {
        await session.send(known);
        return;
      }
      const root = physicalRoot(this.env.store.driveRoots.byId(session.rootId));
      assertWritable(root);
      const reply = await work(root);
      if (reply.type !== 'need_blocks') remember(this.env, session, reply);
      await session.send(reply);
    });
  }

  private async push(session: SyncSession, root: DriveWriteRoot, message: Push): Promise<Reply> {
    const { env } = this;
    const hashes = verifiedBlocks(message);
    const existing = env.store.driveItems.byPath(root.id, message.relPath);
    const reason = pathReason(env, root.id, message.relPath);
    if (reason !== null) return conflictOf(message.opId, reason, existing?.rev ?? 0, null);
    if (existing?.kind === 'folder') return conflictOf(message.opId, 'exists', existing.rev, null);
    const file = existing === undefined ? null : fileOf(existing);
    const plan = planOf(file, await hubEntryOf(env, root, existing), message);
    if (plan.kind === 'noop') return acceptOf(env, root.id, message.opId, plan.rev);
    if (plan.kind === 'conflict' && !this.copiesKept(root.id)) {
      return conflictOf(message.opId, 'stale', plan.hub.rev, null);
    }
    return this.open(session, root, { message, hashes, existing });
  }

  private copiesKept(rootId: string): boolean {
    const row = this.env.store.driveRoots.byId(rootId);
    return row.synced && row.sync.conflictCopies;
  }

  private async open(
    session: SyncSession,
    root: DriveWriteRoot,
    push: {
      readonly message: Push;
      readonly hashes: readonly string[];
      readonly existing?: DriveItem | undefined;
    },
  ): Promise<NeedBlocksMessage> {
    const { env, txns } = this;
    const { message } = push;
    const spec: TxnSpec = {
      clientId: session.clientId,
      deviceId: session.deviceId,
      profileId: session.profileId,
      id: randomUUID(),
      opId: message.opId,
      rootId: root.id,
      relPath: message.relPath,
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

  private async move(session: SyncSession, root: DriveWriteRoot, message: Move): Promise<Reply> {
    const { env } = this;
    const from = env.store.driveItems.byPath(root.id, message.from);
    if (from === undefined) return conflictOf(message.opId, 'missing', 0, null);
    const refused = await this.moveRefused(root, message, from);
    if (refused !== null) return refused;
    const actor = syncActor(session);
    await ensureFolders(env, root, message.to, actor);
    await this.relocate(root, from, message.to, actor);
    return acceptOf(env, root.id, message.opId, env.store.driveItems.byId(from.id).rev);
  }

  private async moveRefused(
    root: DriveWriteRoot,
    message: Move,
    from: DriveItem,
  ): Promise<ConflictMessage | null> {
    const { env } = this;
    const inside = from.kind === 'folder' && message.to.startsWith(`${from.relPath}/`);
    if (inside || pathReason(env, root.id, message.to) !== null) {
      return conflictOf(message.opId, 'path', from.rev, null);
    }
    const to = env.store.driveItems.byPath(root.id, message.to);
    if (decideMove(entryAt(from), entryAt(to), message) === 'conflict') {
      const reason = from.rev === message.baseRev ? 'exists' : 'stale';
      return conflictOf(message.opId, reason, from.rev, null);
    }
    const occupied = await env.files.stamp(await locate(root, message.to));
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
    const { entries } = this.env.store.driveItems.children(folder.rootId, folder.id, null, 1);
    return entries.length > 0;
  }

  private async tombstone(
    session: SyncSession,
    root: DriveWriteRoot,
    message: Tombstone,
  ): Promise<Reply> {
    const { env } = this;
    const item = env.store.driveItems.byPath(root.id, message.relPath);
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
