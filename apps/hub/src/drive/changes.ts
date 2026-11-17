import { randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import type { DriveFeedOp, DriveItem, DriveVersion, DriveVia } from '@smarteverything/domain';
import type { DriveInodePatch } from '../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemIdentity } from '../store/repositories/drive-items';
import type { Store } from '../store/store';
import {
  DriveWriteError,
  locate,
  type DriveFileStore,
  type DriveWriteRoot,
  type FileEnv,
  type FileStamp,
} from './intents';
import { takenMonths } from './changes-months';
import { classify } from './scanner-commit';
import { onlyFile, onlyFilePlaced, type FileItem } from './file-item';
import { discardUndo, type CommittedBytes } from './patch-commit';
import { carryBlocks, namesSharing } from './shared-names';
import { commitBytes, newVersion, type StagedBytes } from './versions';

export interface ChangeActor {
  readonly actorProfileId: string | null;
  readonly via: DriveVia;
  readonly deviceId: string | null;
}

export interface PurgeSchedule {
  readonly rearm: () => void;
}

export type ChangeStore = DriveFileStore &
  Pick<Store, 'driveItems' | 'driveFeed' | 'driveGrants' | 'driveBlocks' | 'feed'>;

export interface ChangeEnv extends FileEnv {
  readonly store: ChangeStore;
  readonly purge: PurgeSchedule;
  readonly settle?: <T>(work: () => T) => Promise<T>;
}

export function isoOf(mtimeNs: bigint): string {
  return new Date(Number(mtimeNs / 1_000_000n)).toISOString();
}

export function identityOf(stamp: FileStamp): DriveItemIdentity {
  return { dev: stamp.dev.toString(), ino: stamp.ino.toString() };
}

export function announce(
  env: ChangeEnv,
  rootId: string,
  parentId: string | null,
  touched: readonly DriveItem[],
): void {
  env.store.feed.notice({
    type: 'drive_changed',
    rootIds: [rootId],
    folderIds: parentId === null ? [] : env.store.driveItems.folderChainOf(parentId),
    albumIds: [],
    months: takenMonths(touched),
    cursor: env.store.driveFeed.latestSeq(),
  });
}

export function appendFeed(
  env: ChangeEnv,
  item: DriveItem,
  op: DriveFeedOp,
  actor: ChangeActor,
): void {
  env.store.driveFeed.append({
    rootId: item.rootId,
    itemId: item.id,
    op,
    rev: item.rev,
    actorProfileId: actor.actorProfileId,
    via: actor.via,
    deviceId: actor.deviceId,
  });
}

interface Common {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly starred: false;
  readonly shared: false;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly remoteId: null;
  readonly remoteRev: null;
}

const NO_MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
} as const;

export interface NewItem {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly id?: string;
}

function commonOf(item: NewItem): Common {
  return {
    id: item.id ?? randomUUID(),
    rootId: item.rootId,
    parentId: item.parentId,
    relPath: item.relPath,
    name: basename(item.relPath),
    modifiedAt: item.modifiedAt,
    addedAt: item.addedAt,
    starred: false,
    shared: false,
    outside: item.outside,
    addedByProfileId: item.addedByProfileId,
    remoteId: null,
    remoteRev: null,
  };
}

export interface FileContent {
  readonly bytes: number;
  readonly sha256: string | null;
}

export function fileDraft(item: NewItem, content: FileContent): DriveItemDraft {
  const common = commonOf(item);
  const { mime, kind } = classify(common.name);
  const file = {
    ...common,
    mime,
    bytes: content.bytes,
    sha256: content.sha256,
    integrity: content.sha256 === null ? 'unknown' : 'ok',
    thumb: { state: 'none' },
  } as const;
  switch (kind) {
    case 'image':
      return { ...file, ...NO_MEDIA, kind };
    case 'video':
      return { ...file, ...NO_MEDIA, kind, durationMs: null };
    case 'audio':
      return { ...file, kind, takenAt: null, durationMs: null };
    case 'document':
    case 'other':
      return { ...file, kind };
  }
}

export function folderDraft(item: NewItem, bytes: number): DriveItemDraft {
  return { ...commonOf(item), kind: 'folder', childCount: 0, bytes };
}

export function parentOf(env: ChangeEnv, rootId: string, relPath: string): DriveItem | null {
  const folder = dirname(relPath);
  if (folder === '.') {
    return null;
  }
  const parent = env.store.driveItems.byPath(rootId, folder, null);
  if (parent?.kind !== 'folder') {
    throw new DriveWriteError('missing', 'The folder is not in the index.');
  }
  return parent;
}

export function parentIdOf(env: ChangeEnv, rootId: string, relPath: string): string | null {
  const folder = dirname(relPath);
  if (folder === '.') {
    return null;
  }
  const parent = env.store.driveItems.lookups.placed(rootId, folder);
  if (parent?.kind !== 'folder') {
    throw new DriveWriteError('missing', 'The folder is not in the index.');
  }
  return parent.id;
}

export interface ItemRecord {
  readonly draft: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly op: DriveFeedOp;
  readonly actor: ChangeActor;
}

export function recordItem(env: ChangeEnv, record: ItemRecord): DriveItem {
  return env.store.write(() => {
    const written = env.store.driveItems.write({ item: record.draft, identity: record.identity });
    if (written.changed) {
      appendFeed(env, written.item, record.op, record.actor);
      announce(env, written.item.rootId, written.item.parentId, [written.item]);
    }
    return written.item;
  });
}

export interface ContentWrite {
  readonly root: DriveWriteRoot;
  readonly staged: StagedBytes;
  readonly relPath: string;
  readonly actor: ChangeActor;
  readonly mode?: number | undefined;
  readonly inode?: DriveInodePatch | undefined;
  readonly alongside?: (item: DriveItem) => void;
}

export interface ContentResult {
  readonly item: DriveItem;
  readonly created: boolean;
  readonly version: DriveVersion | null;
}

export function trustedSha(existing: FileItem | undefined, live: FileStamp | null): string | null {
  if (existing === undefined || live === null) {
    return null;
  }
  const current = existing.bytes === live.size && existing.modifiedAt === isoOf(live.mtimeNs);
  return current ? existing.sha256 : null;
}

function replacedDraft(
  existing: FileItem,
  stamp: FileStamp,
  sha256: string | null,
): DriveItemDraft {
  return {
    ...existing,
    bytes: stamp.size,
    modifiedAt: isoOf(stamp.mtimeNs),
    sha256,
    integrity: sha256 === null ? 'unknown' : 'ok',
    thumb: { state: 'none' },
    outside: false,
  };
}

export interface Settle {
  readonly env: ChangeEnv;
  readonly root: DriveWriteRoot;
  readonly relPath: string;
  readonly actor: ChangeActor;
  readonly alongside: ((item: DriveItem) => void) | undefined;
  readonly mode: number | undefined;
  readonly inode?: DriveInodePatch | undefined;
  readonly existing: FileItem | undefined;
  readonly parentId: string | null;
  readonly before: FileStamp | null;
  readonly committed: CommittedBytes;
}

function captureRow(settle: Settle): DriveVersion | null {
  const { env, root, actor, existing, before, committed } = settle;
  if (committed.captured === null || existing === undefined) {
    return null;
  }
  return env.store.driveVersions.insert(
    root.id,
    newVersion(env, {
      itemId: existing.id,
      rev: existing.rev,
      sha256: committed.captured.sha256,
      bytes: before?.size ?? existing.bytes,
      actorProfileId: actor.actorProfileId,
      via: actor.via,
      deviceId: actor.deviceId,
      addedByProfileId: existing.addedByProfileId,
    }),
  ).version;
}

function writtenDraft(settle: Settle): DriveItemDraft {
  const { env, root, actor, existing, parentId, committed, relPath } = settle;
  if (existing !== undefined) {
    return replacedDraft(existing, committed.stamp, committed.sha256);
  }
  const scanned = onlyFilePlaced(env.store.driveItems.lookups.placed(root.id, relPath));
  const added = {
    rootId: root.id,
    parentId,
    relPath,
    modifiedAt: isoOf(committed.stamp.mtimeNs),
    addedAt: scanned?.addedAt ?? env.now().toISOString(),
    outside: false,
    addedByProfileId: actor.actorProfileId,
    ...(scanned === undefined ? {} : { id: scanned.id }),
  };
  return fileDraft(added, { bytes: committed.stamp.size, sha256: committed.sha256 });
}

function updateNames(settle: Settle, existing: FileItem, inode: DriveInodePatch): DriveItem[] {
  const { env, actor, committed } = settle;
  const identity = identityOf(committed.stamp);
  const touched: DriveItem[] = [];
  for (const sibling of namesSharing(env.store, existing)) {
    const draft = replacedDraft(sibling, committed.stamp, committed.sha256);
    const update = env.store.driveItems.write({ item: draft, identity, inode });
    if (update.changed) {
      appendFeed(env, update.item, 'update', actor);
      touched.push(update.item);
    }
  }
  return touched;
}

export function settleContent(settle: Settle): ContentResult {
  const { env, root, actor, existing, committed, mode } = settle;
  const version = captureRow(settle);
  const inode = {
    mtimeNs: committed.stamp.mtimeNs,
    ...(mode === undefined ? {} : { mode }),
    ...settle.inode,
  };
  const identity = identityOf(committed.stamp);
  const written = env.store.driveItems.write({ item: writtenDraft(settle), identity, inode });
  if (written.changed) {
    appendFeed(env, written.item, existing === undefined ? 'create' : 'update', actor);
  }
  const siblings = existing === undefined ? [] : updateNames(settle, existing, inode);
  settle.alongside?.(written.item);
  carryBlocks(env.store, written.item, siblings);
  env.store.driveIntents.clear(committed.intent.id);
  announce(env, root.id, written.item.parentId, [written.item, ...siblings]);
  return { item: written.item, created: existing === undefined, version };
}

export interface Located {
  readonly existing: FileItem | undefined;
  readonly before: FileStamp | null;
}

export async function locateExisting(
  env: ChangeEnv,
  root: DriveWriteRoot,
  relPath: string,
): Promise<Located> {
  const before = await env.files.stamp(await locate(root, relPath));
  const existing =
    env.store.driveItems.lookups.placed(root.id, relPath) === undefined
      ? undefined
      : onlyFile(env.store.driveItems.byPath(root.id, relPath, null));
  if (existing === undefined && before !== null) {
    throw new DriveWriteError('exists', 'The file is not in the index yet; scan the root first.');
  }
  return { existing, before };
}

export async function finishContent(
  env: ChangeEnv,
  root: DriveWriteRoot,
  committed: CommittedBytes,
  settle: () => ContentResult,
): Promise<ContentResult> {
  const result = env.settle === undefined ? env.store.write(settle) : await env.settle(settle);
  if (committed.intent.op === 'patch') {
    await discardUndo(env, root, committed.intent.fromPath);
  }
  env.purge.rearm();
  return result;
}

export interface PreparedContent {
  readonly committed: CommittedBytes;
  readonly settle: () => ContentResult;
}

export async function prepareContent(
  env: ChangeEnv,
  write: ContentWrite,
  deferred?: Set<string>,
): Promise<PreparedContent> {
  const { root, relPath, actor } = write;
  const { existing, before } = await locateExisting(env, root, relPath);
  const parentId = parentIdOf(env, root.id, relPath);
  const committed = await commitBytes(env, {
    root,
    staged: write.staged,
    relPath,
    previousSha256: trustedSha(existing, before),
    mode: write.mode,
    deferred,
  });
  const alongside = write.alongside;
  const settle = { env, root, relPath, actor, alongside, mode: write.mode, inode: write.inode };
  return {
    committed,
    settle: () => settleContent({ ...settle, existing, parentId, before, committed }),
  };
}

export async function commitContent(env: ChangeEnv, write: ContentWrite): Promise<ContentResult> {
  const prepared = await prepareContent(env, write);
  return finishContent(env, write.root, prepared.committed, prepared.settle);
}
