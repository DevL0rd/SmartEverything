import { basename } from 'node:path';
import {
  ApiError,
  type DriveItem,
  type DriveTransfer,
  type DriveTransferOffer,
  type DriveTrashEntry,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DriveItemIdentity } from '../../store/repositories/drive-items';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import {
  DriveTransferAnsweredError,
  DriveTransferOpenError,
} from '../../store/repositories/drive-transfers';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { inLockedFolder, itemAccess, type DriveActor } from '../access';
import { announce, appendFeed } from '../change-rows';
import type { ChangeActor } from '../changes';
import { collectTree, type Tree } from '../sharing/transfer-tree';
import { TransferRows } from '../sharing/transfer-rows';

const log = new Logger('hub.drive');

export interface TransferPlan {
  readonly top: DriveItem;
  readonly from: StoredDrive;
  readonly to: StoredDrive;
  readonly tree: Tree;
}

export interface TransferRewrite {
  readonly transfer: DriveTransfer;
  readonly topId: string;
  readonly topParentId: string | null;
  readonly fromRootId: string;
  readonly toRootId: string;
  readonly tree: Tree;
  readonly landing: readonly {
    readonly itemId: string;
    readonly relPath: string;
    readonly identity: DriveItemIdentity;
  }[];
}

export interface TransferSettle {
  readonly id: string;
  readonly state: 'accepted' | 'declined' | 'cancelled';
  readonly tell: boolean;
}

function transferActor(profileId: string): ChangeActor {
  return { actorProfileId: profileId, via: 'app', deviceId: null };
}

function personalDriveOf(
  store: Pick<Store, 'driveRoots'>,
  profileId: string,
): StoredDrive | undefined {
  return store.driveRoots
    .list()
    .find((drive) => drive.scope === 'person' && drive.ownerProfileId === profileId);
}

function ownItem(store: Store, actor: DriveActor, itemId: string): DriveItem {
  const item = store.driveItems.find(itemId, actor.profileId);
  const drive = item === undefined ? undefined : store.driveRoots.find(item.rootId);
  const access =
    item === undefined || drive === undefined ? 'none' : itemAccess(store, actor, drive, item);
  if (item === undefined || drive === undefined || access === 'none') {
    throw new ApiError('not_found', 'There is no such file or folder for this caller.');
  }
  if (access !== 'own' || drive.scope !== 'person') {
    throw new ApiError('forbidden', 'Only the person whose drive this is can give it away.');
  }
  if (inLockedFolder(item)) {
    throw new ApiError('forbidden', 'Locked items cannot be given away.');
  }
  return item;
}

function requireRecipient(store: Store, actor: DriveActor, toProfileId: string): void {
  if (toProfileId === actor.profileId) {
    throw new ApiError('invalid_request', 'An item cannot be given to its own owner.');
  }
  if (!store.profiles.list().some((profile) => profile.id === toProfileId)) {
    throw new ApiError('not_found', 'There is no such person to give it to.');
  }
  if (personalDriveOf(store, toProfileId) === undefined) {
    throw new ApiError('invalid_request', 'That person has no drive to receive it.');
  }
}

function alreadyOffered(
  store: Store,
  actor: DriveActor,
  offered: DriveTransferOffer,
): DriveTransfer | undefined {
  const made = offered.id === undefined ? undefined : store.driveTransfers.find(offered.id);
  if (made === undefined) return undefined;
  const same =
    made.fromProfileId === actor.profileId &&
    made.itemId === offered.itemId &&
    made.toProfileId === offered.toProfileId;
  if (!same) throw new ApiError('forbidden', 'That ownership offer belongs to someone else.');
  log.debug('drive_transfer.duplicate_offer_ignored', { transferId: made.id });
  return made;
}

function offer(
  store: Store,
  input: { readonly actor: DriveActor; readonly offer: DriveTransferOffer },
): DriveTransfer {
  const { actor } = input;
  const made = alreadyOffered(store, actor, input.offer);
  if (made !== undefined) return made;
  const item = ownItem(store, actor, input.offer.itemId);
  requireRecipient(store, actor, input.offer.toProfileId);
  try {
    const created = store.driveTransfers.offer({
      id: input.offer.id,
      itemId: item.id,
      fromProfileId: actor.profileId,
      toProfileId: input.offer.toProfileId,
    });
    store.driveNotifications.add({
      profileId: input.offer.toProfileId,
      kind: 'transfer_offered',
      itemId: item.id,
      actorProfileId: actor.profileId,
      actorName: null,
      refId: created.id,
    });
    log.info('drive_transfer.offered', { transferId: created.id, itemId: item.id });
    return created;
  } catch (cause) {
    if (cause instanceof DriveTransferOpenError) {
      throw new ApiError('conflict', 'That item is already offered to someone.');
    }
    throw cause;
  }
}

function settle(store: Store, input: TransferSettle): DriveTransfer {
  let settled: DriveTransfer;
  try {
    settled = store.driveTransfers.settle(input.id, input.state);
  } catch (cause) {
    if (cause instanceof DriveTransferAnsweredError) {
      throw new ApiError('conflict', 'That offer was already answered.');
    }
    throw cause;
  }
  if (input.tell) {
    store.driveNotifications.add({
      profileId: settled.fromProfileId,
      kind: 'transfer_answered',
      itemId: settled.itemId,
      actorProfileId: settled.toProfileId,
      actorName: null,
      refId: settled.id,
    });
  }
  return settled;
}

function plan(store: Store, transfer: DriveTransfer): TransferPlan {
  const top = store.driveItems.find(transfer.itemId, null);
  if (top === undefined) {
    throw new ApiError('not_found', 'The item that was offered is gone.');
  }
  const from = store.driveRoots.byId(top.rootId);
  const to = personalDriveOf(store, transfer.toProfileId);
  if (from.scope !== 'person' || from.ownerProfileId !== transfer.fromProfileId) {
    throw new ApiError('conflict', 'That item no longer belongs to the person who offered it.');
  }
  if (to === undefined) {
    throw new ApiError('invalid_request', 'The person receiving it has no drive.');
  }
  return { top, from, to, tree: collectTree(store, top) };
}

function trashedUnder(
  store: Store,
  input: { readonly rootId: string; readonly folderIds: readonly string[] },
): DriveTrashEntry[] {
  return new TransferRows(store.context)
    .trashedUnder(input.rootId, input.folderIds)
    .map((id) => store.driveTrash.byId(id));
}

function unreferenced(
  store: Store,
  input: { readonly rootId: string; readonly shas: readonly string[] },
): string[] {
  return input.shas.filter((sha) => store.driveVersions.references(input.rootId, sha) === 0);
}

function rewrite(store: Store, move: TransferRewrite): string[] {
  const { transfer, tree } = move;
  const rows = new TransferRows(store.context);
  const ids = new Set(tree.items.map((item) => item.id));
  const landed = new Map(move.landing.map((entry) => [entry.itemId, entry]));
  const actor = transferActor(transfer.toProfileId);
  const env = { store };
  for (const before of tree.items) {
    const entry = landed.get(before.id);
    if (entry === undefined) continue;
    const written = store.driveItems.write({
      item: {
        ...before,
        rootId: move.toRootId,
        parentId: before.id === move.topId ? null : before.parentId,
        relPath: entry.relPath,
        name: basename(entry.relPath),
        addedByProfileId: transfer.toProfileId,
      },
      identity: entry.identity,
    });
    appendFeed(env, written.item, 'create', actor);
    appendFeed(env, before, 'delete', actor);
  }
  rows.reroot({
    itemIds: tree.items.map((item) => item.id),
    folderIds: tree.folderIds,
    toRootId: move.toRootId,
    recipientProfileId: transfer.toProfileId,
  });
  for (const grant of store.driveGrants.receivedBy(transfer.toProfileId)) {
    if (ids.has(grant.itemId)) store.driveGrants.remove(grant.id);
  }
  store.driveGrants.set(
    { itemId: move.topId, profileId: transfer.fromProfileId, role: 'edit', expiresAt: null },
    transfer.toProfileId,
  );
  const placementIds = rows.placementsOn(move.fromRootId, tree.folderIds);
  announce(env, move.fromRootId, move.topParentId, tree.items);
  announce(env, move.toRootId, null, tree.items);
  return placementIds;
}

export const DRIVE_TRANSFER_OFFER_UNIT = storeUnit(offer);

export const DRIVE_TRANSFER_SETTLE_UNIT = storeUnit(settle);

export const DRIVE_TRANSFER_PLAN_UNIT = storeUnit(plan);

export const DRIVE_TRANSFER_TRASHED_UNIT = storeUnit(trashedUnder);

export const DRIVE_TRANSFER_UNREFERENCED_UNIT = storeUnit(unreferenced);

export const DRIVE_TRANSFER_REWRITE_UNIT = storeUnit(rewrite);
