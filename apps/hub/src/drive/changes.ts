import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DriveFeedOp, DriveItem, DriveVersion, DriveVia } from '@smarteverything/domain';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { DriveItemDraft, DriveItemIdentity } from '../store/repositories/drive-items';
import type { Store } from '../store/store';
import {
  DriveWriteError,
  locate,
  shaOfVersionPath,
  type DriveFileStore,
  type DriveWriteRoot,
  type FileEnv,
  type FileStamp,
} from './intents';
import { takenMonths } from './changes-months';
import { classify } from './scanner-commit';
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
  Pick<Store, 'driveItems' | 'driveFeed' | 'driveGrants' | 'feed'>;

export interface ChangeEnv extends FileEnv {
  readonly store: ChangeStore;
  readonly purge: PurgeSchedule;
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
    folderIds: parentId === null ? [] : [parentId],
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
  readonly alongside?: (item: DriveItem) => void;
}

export interface ContentResult {
  readonly item: DriveItem;
  readonly created: boolean;
  readonly version: DriveVersion | null;
}

function trustedSha(existing: DriveItem | undefined, live: FileStamp | null): string | null {
  if (existing === undefined || existing.kind === 'folder' || live === null) {
    return null;
  }
  const current = existing.bytes === live.size && existing.modifiedAt === isoOf(live.mtimeNs);
  return current ? existing.sha256 : null;
}

function replacedDraft(existing: DriveItem, stamp: FileStamp, staged: StagedBytes): DriveItemDraft {
  if (existing.kind === 'folder') {
    throw new DriveWriteError('exists', 'A folder is in the way of the file.');
  }
  return {
    ...existing,
    bytes: staged.bytes,
    modifiedAt: isoOf(stamp.mtimeNs),
    sha256: staged.sha256,
    integrity: 'ok',
    thumb: { state: 'none' },
    outside: false,
  };
}

interface Settle {
  readonly env: ChangeEnv;
  readonly write: ContentWrite;
  readonly existing: DriveItem | undefined;
  readonly parent: DriveItem | null;
  readonly before: FileStamp | null;
  readonly committed: Awaited<ReturnType<typeof commitBytes>>;
}

function captureRow(settle: Settle): DriveVersion | null {
  const { env, write, existing, before, committed } = settle;
  if (committed.captured === null || existing === undefined) {
    return null;
  }
  return env.store.driveVersions.insert(
    write.root.id,
    newVersion(env, {
      itemId: existing.id,
      rev: existing.rev,
      sha256: committed.captured.sha256,
      bytes: before?.size ?? existing.bytes,
      actorProfileId: write.actor.actorProfileId,
      via: write.actor.via,
      deviceId: write.actor.deviceId,
      addedByProfileId: existing.addedByProfileId,
    }),
  ).version;
}

function settleContent(settle: Settle): ContentResult {
  const { env, write, existing, parent, committed } = settle;
  const { root, actor } = write;
  const version = captureRow(settle);
  const draft =
    existing === undefined
      ? fileDraft(
          {
            rootId: root.id,
            parentId: parent?.id ?? null,
            relPath: write.relPath,
            modifiedAt: isoOf(committed.stamp.mtimeNs),
            addedAt: env.now().toISOString(),
            outside: false,
            addedByProfileId: actor.actorProfileId,
          },
          write.staged,
        )
      : replacedDraft(existing, committed.stamp, write.staged);
  const written = env.store.driveItems.write({
    item: draft,
    identity: identityOf(committed.stamp),
  });
  if (written.changed) {
    appendFeed(env, written.item, existing === undefined ? 'create' : 'update', actor);
  }
  write.alongside?.(written.item);
  env.store.driveIntents.clear(committed.intent.id);
  announce(env, root.id, written.item.parentId, [written.item]);
  return { item: written.item, created: existing === undefined, version };
}

export async function commitContent(env: ChangeEnv, write: ContentWrite): Promise<ContentResult> {
  const { root, relPath } = write;
  const before = await env.files.stamp(await locate(root, relPath));
  const existing = env.store.driveItems.byPath(root.id, relPath, null);
  if (existing === undefined && before !== null) {
    throw new DriveWriteError('exists', 'The file is not in the index yet; scan the root first.');
  }
  const parent = parentOf(env, root.id, relPath);
  const committed = await commitBytes(env, {
    root,
    staged: write.staged,
    relPath,
    previousSha256: trustedSha(existing, before),
  });
  const result = env.store.write(() =>
    settleContent({ env, write, existing, parent, before, committed }),
  );
  env.purge.rearm();
  return result;
}

const OUTSIDE: ChangeActor = { actorProfileId: null, via: 'outside', deviceId: null };

interface Finished {
  readonly env: ChangeEnv;
  readonly root: DriveWriteRoot;
  readonly intent: DriveIntent;
  readonly existing: DriveItem | undefined;
  readonly stamp: FileStamp;
}

function finishedDraft({ env, root, intent, existing, stamp }: Finished): DriveItemDraft {
  if (existing === undefined) {
    return fileDraft(
      {
        rootId: root.id,
        parentId: parentOf(env, root.id, intent.toPath)?.id ?? null,
        relPath: intent.toPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: env.now().toISOString(),
        outside: true,
        addedByProfileId: null,
      },
      { bytes: stamp.size, sha256: null },
    );
  }
  if (existing.kind === 'folder') {
    throw new DriveWriteError('exists', 'A folder is in the way of the file.');
  }
  return {
    ...existing,
    bytes: stamp.size,
    modifiedAt: isoOf(stamp.mtimeNs),
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    outside: true,
  };
}

function statLive(root: DriveWriteRoot, relPath: string): FileStamp {
  const stat = lstatSync(join(root.path, relPath), { bigint: true });
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: Number(stat.size),
    mtimeNs: stat.mtimeNs,
    directory: stat.isDirectory(),
  };
}

export function finishCommitFromDisk(
  env: ChangeEnv,
): (intent: DriveIntent, root: DriveWriteRoot) => void {
  return (intent, root) => {
    const stamp = statLive(root, intent.toPath);
    const existing = env.store.driveItems.byPath(root.id, intent.toPath, null);
    env.store.write(() => {
      if (intent.versionPath !== null && existing !== undefined && existing.kind !== 'folder') {
        const sha256 = shaOfVersionPath(intent.versionPath);
        env.store.driveVersions.insert(
          root.id,
          newVersion(env, {
            itemId: existing.id,
            rev: existing.rev,
            sha256,
            bytes: existing.bytes,
            ...OUTSIDE,
            addedByProfileId: existing.addedByProfileId,
          }),
        );
      }
      const written = env.store.driveItems.write({
        item: finishedDraft({ env, root, intent, existing, stamp }),
        identity: identityOf(stamp),
      });
      appendFeed(env, written.item, existing === undefined ? 'create' : 'update', OUTSIDE);
      env.store.driveIntents.clear(intent.id);
      announce(env, root.id, written.item.parentId, [written.item]);
    });
    env.purge.rearm();
  };
}
