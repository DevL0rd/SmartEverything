import { dirname } from 'node:path';
import {
  DRIVE_CONFLICT,
  type DriveConflict,
  type DriveItem,
  type DriveVersion,
} from '@smarteverything/domain';
import type { DriveInodePatch } from '../../store/repositories/drive-item-inodes';
import type { DrivePlaced } from '../../store/repositories/drive-item-lookups';
import type { DriveItemDraft } from '../../store/repositories/drive-items';
import type { DriveInodeAttributes, DriveInodeTimes } from '../../store/repositories/drive-inodes';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { settleBackupIn } from '../../photos/backup-records';
import type { ChangeActor, ContentResult, ItemRecord } from '../changes';
import {
  announce,
  appendFeed,
  fileDraftOf,
  identityOf,
  isoOf,
  newVersion,
  replacedDraft,
} from '../change-rows';
import { onlyFilePlaced, type FileItem } from '../file-item';
import type { DriveWriteRoot, FileStamp } from '../intents';
import type { CommittedBytes } from '../patch-commit';
import type { FileType } from '../scanner-drafts';
import type { ReplayClaim } from '../replay-claims';
import { carryBlocks, namesSharing } from '../shared-names';

export type ContentAlongside =
  | { readonly kind: 'blocks'; readonly blockSize: number; readonly hashes: Uint8Array }
  | { readonly kind: 'uploadComplete'; readonly uploadId: string }
  | { readonly kind: 'backupSettle' }
  | { readonly kind: 'conflict'; readonly conflict: Omit<DriveConflict, 'conflictItemId'> }
  | {
      readonly kind: 'adoptInode';
      readonly sourceInodeId: number;
      readonly sourceItemId: string;
      readonly targetInodeId: number;
      readonly attributes: DriveInodeAttributes;
      readonly times: DriveInodeTimes;
    }
  | { readonly kind: 'mountCommit'; readonly commitId: number; readonly size: number }
  | {
      readonly kind: 'fileRequest';
      readonly requestId: string;
      readonly receiverProfileId: string;
      readonly createdBy: string;
      readonly folderId: string;
      readonly uploaderName: string;
    };

export interface SettleInput {
  readonly root: DriveWriteRoot;
  readonly relPath: string;
  readonly type: FileType;
  readonly actor: ChangeActor;
  readonly alongside: readonly ContentAlongside[];
  readonly mode: number | undefined;
  readonly inode: DriveInodePatch | undefined;
  readonly existing: FileItem | undefined;
  readonly parentId: string | null;
  readonly before: FileStamp | null;
  readonly committed: CommittedBytes;
  readonly id: string | undefined;
  readonly claim: ReplayClaim | null;
}

export interface SettledContent extends ContentResult {
  readonly conflicts: readonly DriveConflict[];
}

export type SettleStore = Pick<
  Store,
  | 'context'
  | 'now'
  | 'feed'
  | 'driveItems'
  | 'driveFeed'
  | 'driveVersions'
  | 'driveInodes'
  | 'driveXattrs'
  | 'driveBlocks'
  | 'driveIntents'
  | 'driveUploads'
  | 'driveConflicts'
  | 'driveFileRequests'
  | 'driveNotifications'
  | 'driveMountCommits'
  | 'driveSyncOps'
>;

interface SettleCall extends SettleInput {
  readonly store: SettleStore;
}

function captureRow(call: SettleCall): DriveVersion | null {
  const { store, root, actor, existing, before, committed } = call;
  if (committed.captured === null || existing === undefined) {
    return null;
  }
  return store.driveVersions.insert(
    root.id,
    newVersion(store, {
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

function writtenDraft(call: SettleCall): DriveItemDraft {
  const { store, root, actor, existing, parentId, committed, relPath } = call;
  if (existing !== undefined) {
    return replacedDraft(existing, committed.stamp, committed.sha256);
  }
  const scanned = onlyFilePlaced(store.driveItems.lookups.placed(root.id, relPath));
  const id = scanned === undefined ? call.id : scanned.id;
  const added = {
    rootId: root.id,
    parentId,
    relPath,
    modifiedAt: isoOf(committed.stamp.mtimeNs),
    addedAt: scanned?.addedAt ?? store.now().toISOString(),
    outside: false,
    addedByProfileId: actor.actorProfileId,
    ...(id === undefined ? {} : { id }),
  };
  return fileDraftOf(added, { bytes: committed.stamp.size, sha256: committed.sha256 }, call.type);
}

function updateNames(call: SettleCall, existing: FileItem, inode: DriveInodePatch): DriveItem[] {
  const { store, actor, committed } = call;
  const identity = identityOf(committed.stamp);
  const touched: DriveItem[] = [];
  for (const sibling of namesSharing(store, existing)) {
    const draft = replacedDraft(sibling, committed.stamp, committed.sha256);
    const update = store.driveItems.write({ item: draft, identity, inode });
    if (update.changed) {
      appendFeed(call, update.item, 'update', actor);
      touched.push(update.item);
    }
  }
  return touched;
}

function recordFileRequest(
  store: SettleStore,
  item: DriveItem,
  spec: Extract<ContentAlongside, { readonly kind: 'fileRequest' }>,
): void {
  store.context.sql.run(
    'count the received file toward the space of the drive owner',
    'update drive_items set added_by_profile_id = $owner where id = $id',
    { owner: spec.receiverProfileId, id: item.id },
  );
  store.driveFileRequests.recordUpload({
    requestId: spec.requestId,
    itemId: item.id,
    uploaderName: spec.uploaderName,
    bytes: item.bytes,
  });
  store.driveNotifications.add({
    profileId: spec.createdBy,
    kind: 'file_request_upload',
    itemId: spec.folderId,
    actorProfileId: null,
    actorName: spec.uploaderName,
    refId: spec.requestId,
  });
}

function adoptInode(
  store: SettleStore,
  spec: Extract<ContentAlongside, { readonly kind: 'adoptInode' }>,
): void {
  store.driveInodes.setAttributes(spec.targetInodeId, spec.attributes);
  for (const name of store.driveXattrs.names(spec.targetInodeId)) {
    store.driveXattrs.remove(spec.targetInodeId, name);
  }
  store.driveXattrs.copy(spec.sourceInodeId, spec.targetInodeId);
  store.driveInodes.setTimes(spec.targetInodeId, spec.times);
  store.driveItems.remove(spec.sourceItemId);
}

function runAlongside(
  store: Store,
  item: DriveItem,
  alongside: readonly ContentAlongside[],
): DriveConflict[] {
  const conflicts: DriveConflict[] = [];
  for (const spec of alongside) {
    switch (spec.kind) {
      case 'blocks':
        store.driveBlocks.put({
          itemId: item.id,
          rev: item.rev,
          blockSize: spec.blockSize,
          hashes: spec.hashes,
        });
        store.driveBlocks.removeBefore(item.id, item.rev);
        break;
      case 'uploadComplete':
        store.driveUploads.complete(spec.uploadId, item);
        break;
      case 'backupSettle':
        settleBackupIn(store, item);
        break;
      case 'conflict': {
        const conflict = DRIVE_CONFLICT.parse({ ...spec.conflict, conflictItemId: item.id });
        store.driveConflicts.insert(conflict);
        conflicts.push(conflict);
        break;
      }
      case 'adoptInode':
        adoptInode(store, spec);
        break;
      case 'fileRequest':
        recordFileRequest(store, item, spec);
        break;
      case 'mountCommit':
        store.driveMountCommits.finish(spec.commitId, spec.size, item.rev);
        break;
    }
  }
  return conflicts;
}

export function settleContentIn(store: Store, input: SettleInput): SettledContent {
  const call: SettleCall = { ...input, store };
  const { root, actor, existing, committed, mode } = input;
  const version = captureRow(call);
  const inode = {
    mtimeNs: committed.stamp.mtimeNs,
    ...(mode === undefined ? {} : { mode }),
    ...input.inode,
  };
  const identity = identityOf(committed.stamp);
  const written = store.driveItems.write({ item: writtenDraft(call), identity, inode });
  if (written.changed) {
    appendFeed(call, written.item, existing === undefined ? 'create' : 'update', actor);
  }
  const siblings = existing === undefined ? [] : updateNames(call, existing, inode);
  const conflicts = runAlongside(store, written.item, input.alongside);
  carryBlocks(store, written.item, siblings);
  store.driveIntents.clear(committed.intent.id);
  if (input.claim !== null) store.driveSyncOps.claim(input.claim);
  announce(call, root.id, written.item.parentId, [written.item, ...siblings]);
  return { item: written.item, created: existing === undefined, version, conflicts };
}

export function recordItemIn(store: Store, record: ItemRecord): DriveItem {
  const written = store.driveItems.write({ item: record.draft, identity: record.identity });
  if (written.changed) {
    appendFeed({ store }, written.item, record.op, record.actor);
    announce({ store }, written.item.rootId, written.item.parentId, [written.item]);
  }
  return written.item;
}

export const DRIVE_SETTLE_CONTENT_UNIT = storeUnit((store, input: SettleInput) =>
  settleContentIn(store, input),
);

export const DRIVE_SETTLE_BATCH_UNIT = storeUnit((store, inputs: readonly SettleInput[]) =>
  inputs.map((input) => settleContentIn(store, input)),
);

export const DRIVE_RECORD_ITEM_UNIT = storeUnit((store, input: ItemRecord) =>
  recordItemIn(store, input),
);

export interface ContentPlaceInput {
  readonly rootId: string;
  readonly relPath: string;
}

export interface ContentPlace {
  readonly target: DriveItem | undefined;
  readonly parent: DrivePlaced | undefined;
}

export function contentPlace(store: Store, input: ContentPlaceInput): ContentPlace {
  const { rootId, relPath } = input;
  const lookups = store.driveItems.lookups;
  const target =
    lookups.placed(rootId, relPath) === undefined
      ? undefined
      : store.driveItems.byPath(rootId, relPath, null);
  const folder = dirname(relPath);
  return { target, parent: folder === '.' ? undefined : lookups.placed(rootId, folder) };
}

export const DRIVE_CONTENT_PLACE_UNIT = storeUnit((store, input: ContentPlaceInput) =>
  contentPlace(store, input),
);
