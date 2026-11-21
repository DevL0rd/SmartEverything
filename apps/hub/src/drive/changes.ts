import { basename, dirname } from 'node:path';
import type { DriveFeedOp, DriveItem, DriveVersion, DriveVia } from '@smarteverything/domain';
import type { DriveInodePatch } from '../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemIdentity } from '../store/repositories/drive-items';
import type { Store } from '../store/store';
import {
  locate,
  type DriveFileStore,
  type DriveWriteRoot,
  type FileEnv,
  type FileStamp,
} from './intents';
import { DriveWriteError } from './write-error';
import { commonOf, fileDraftOf, isoOf, type FileContent, type NewItem } from './change-rows';
import { classify } from './file-type';
import { onlyFile, type FileItem } from './file-item';
import { discardUndo, type CommittedBytes } from './patch-commit';
import type { ContentAlongside, SettledContent, SettleInput } from './units/content';
import { currentClaim } from './replay-claims';
import { settleContent } from './settle-batch';
import { commitBytes, type StagedBytes } from './versions';

export interface ChangeActor {
  readonly actorProfileId: string | null;
  readonly via: DriveVia;
  readonly deviceId: string | null;
}

export interface PurgeSchedule {
  readonly rearm: () => void;
}

export type ChangeStore = DriveFileStore &
  Pick<Store, 'driveItems' | 'driveFeed' | 'driveGrants' | 'driveBlocks' | 'feed' | 'host'>;

export interface ChangeEnv extends FileEnv {
  readonly store: ChangeStore;
  readonly purge: PurgeSchedule;
}

export function fileDraft(item: NewItem, content: FileContent): DriveItemDraft {
  return fileDraftOf(item, content, classify(basename(item.relPath)));
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

export async function parentIn(
  env: { readonly store: Pick<Store, 'host'> },
  rootId: string,
  relPath: string,
): Promise<DriveItem | null> {
  const folder = dirname(relPath);
  if (folder === '.') {
    return null;
  }
  const parent = await env.store.host.call('driveItems', 'byPath', rootId, folder, null);
  if (parent?.kind !== 'folder') {
    throw new DriveWriteError('missing', 'The folder is not in the index.');
  }
  return parent;
}

export interface ItemRecord {
  readonly draft: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly op: DriveFeedOp;
  readonly actor: ChangeActor;
}

export function recordItem(
  env: { readonly store: Pick<Store, 'host'> },
  record: ItemRecord,
): Promise<DriveItem> {
  return env.store.host.write('driveRecordItem', record);
}

export interface ContentWrite {
  readonly root: DriveWriteRoot;
  readonly staged: StagedBytes;
  readonly relPath: string;
  readonly actor: ChangeActor;
  readonly mode?: number | undefined;
  readonly inode?: DriveInodePatch | undefined;
  readonly alongside?: readonly ContentAlongside[];
  readonly settled?: (settled: SettledContent) => void;
  readonly id?: string | undefined;
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

export interface Located {
  readonly existing: FileItem | undefined;
  readonly before: FileStamp | null;
  readonly parentId: string | null;
}

export async function locateExisting(
  env: ChangeEnv,
  root: DriveWriteRoot,
  relPath: string,
): Promise<Located> {
  const before = await env.files.stamp(await locate(root, relPath));
  const place = await env.store.host.read('driveContentPlace', { rootId: root.id, relPath });
  const existing = onlyFile(place.target);
  if (existing === undefined && before !== null) {
    throw new DriveWriteError('exists', 'The file is not in the index yet; scan the root first.');
  }
  if (dirname(relPath) === '.') return { existing, before, parentId: null };
  if (place.parent?.kind !== 'folder') {
    throw new DriveWriteError('missing', 'The folder is not in the index.');
  }
  return { existing, before, parentId: place.parent.id };
}

export interface FinishContent {
  readonly write: Omit<ContentWrite, 'staged'>;
  readonly located: Located;
  readonly committed: CommittedBytes;
}

export async function finishContent(env: ChangeEnv, finish: FinishContent): Promise<ContentResult> {
  const { write, located, committed } = finish;
  const settled = await settleContent(env.store.host, {
    root: { id: write.root.id, path: write.root.path, versions: write.root.versions },
    relPath: write.relPath,
    type: classify(basename(write.relPath)),
    actor: write.actor,
    alongside: write.alongside ?? [],
    mode: write.mode,
    inode: write.inode,
    existing: located.existing,
    parentId: located.parentId,
    before: located.before,
    committed,
    id: write.id,
    claim: currentClaim() ?? null,
  });
  write.settled?.(settled);
  if (committed.intent.op === 'patch') {
    await discardUndo(env, write.root, committed.intent.fromPath);
  }
  env.purge.rearm();
  return { item: settled.item, created: settled.created, version: settled.version };
}

export interface PreparedContent {
  readonly committed: CommittedBytes;
  readonly input: SettleInput;
}

export async function prepareContent(
  env: ChangeEnv,
  write: ContentWrite,
  deferred: Set<string>,
): Promise<PreparedContent> {
  const located = await locateExisting(env, write.root, write.relPath);
  const committed = await commitBytes(env, {
    root: write.root,
    staged: write.staged,
    relPath: write.relPath,
    previousSha256: trustedSha(located.existing, located.before),
    mode: write.mode,
    deferred,
  });
  const input: SettleInput = {
    root: { id: write.root.id, path: write.root.path, versions: write.root.versions },
    relPath: write.relPath,
    type: classify(basename(write.relPath)),
    actor: write.actor,
    alongside: write.alongside ?? [],
    mode: write.mode,
    inode: write.inode,
    existing: located.existing,
    parentId: located.parentId,
    before: located.before,
    committed,
    id: write.id,
    claim: null,
  };
  return { committed, input };
}

export async function commitContent(env: ChangeEnv, write: ContentWrite): Promise<ContentResult> {
  const located = await locateExisting(env, write.root, write.relPath);
  const committed = await commitBytes(env, {
    root: write.root,
    staged: write.staged,
    relPath: write.relPath,
    previousSha256: trustedSha(located.existing, located.before),
    mode: write.mode,
  });
  return finishContent(env, { write, located, committed });
}
