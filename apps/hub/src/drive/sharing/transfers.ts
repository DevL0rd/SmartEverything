import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import {
  ApiError,
  type DriveItem,
  type DriveTransfer,
  type DriveTransferAnswer,
  type DriveTransferOffer,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import type { DriveItemIdentity } from '../../store/repositories/drive-items';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import {
  DriveTransferAnsweredError,
  DriveTransferOpenError,
} from '../../store/repositories/drive-transfers';
import type { Store } from '../../store/store';
import { inLockedFolder, itemAccess, type DriveActor } from '../access';
import { announce, appendFeed, identityOf, type ChangeActor, type ChangeEnv } from '../changes';
import type { DataSpaceProbe } from '../data-space';
import { locate, versionRelPath, type DriveWriteRoot } from '../intents';
import { checkDriveFreeSpace, checkDriveQuota } from '../quotas';
import { removeTrashEntry } from '../trash';
import { freeNameAt } from '../uploads-tus-wire';
import type { DrivePlacements } from '../placements';
import { collectTree, type Tree } from './transfer-tree';
import { TransferRows } from './transfer-rows';

const log = new Logger('hub.drive');

export const TRANSFER_PAGE_SIZE = 50;

export type TransfersStore = Pick<
  Store,
  | 'context'
  | 'write'
  | 'driveTransfers'
  | 'driveItems'
  | 'driveRoots'
  | 'driveGrants'
  | 'driveVersions'
  | 'driveTrash'
  | 'driveQuotas'
  | 'driveNotifications'
  | 'drivePlacements'
  | 'profiles'
>;

export interface TransfersEnv {
  readonly env: ChangeEnv;
  readonly store: TransfersStore;
  readonly space: DataSpaceProbe['space'];
  readonly placements: Pick<DrivePlacements, 'repoint'>;
}

export interface TransferPage {
  readonly items: readonly DriveTransfer[];
  readonly next: string | null;
}

interface Move {
  readonly transfer: DriveTransfer;
  readonly top: DriveItem;
  readonly from: StoredDrive;
  readonly to: StoredDrive;
  readonly tree: Tree;
  readonly landing: Landing;
  readonly identities: ReadonlyMap<string, DriveItemIdentity>;
}

interface Landing {
  readonly name: string;
  readonly mapped: ReadonlyMap<string, string>;
}

function transferActor(profileId: string): ChangeActor {
  return { actorProfileId: profileId, via: 'app', deviceId: null };
}

function missing(): ApiError {
  return new ApiError('not_found', 'There is no such ownership transfer for this caller.');
}

export class DriveTransfers {
  private readonly accepting = new Set<string>();

  constructor(private readonly deps: TransfersEnv) {}

  offer(actor: DriveActor, input: DriveTransferOffer): DriveTransfer {
    const { store } = this.deps;
    const item = this.ownItem(actor, input.itemId);
    this.requireRecipient(actor, input.toProfileId);
    try {
      return store.write(() => {
        const created = store.driveTransfers.offer({
          itemId: item.id,
          fromProfileId: actor.profileId,
          toProfileId: input.toProfileId,
        });
        store.driveNotifications.add({
          profileId: input.toProfileId,
          kind: 'transfer_offered',
          itemId: item.id,
          actorProfileId: actor.profileId,
          actorName: null,
          refId: created.id,
        });
        log.info('drive_transfer.offered', { transferId: created.id, itemId: item.id });
        return created;
      });
    } catch (cause) {
      if (cause instanceof DriveTransferOpenError) {
        throw new ApiError('conflict', 'That item is already offered to someone.');
      }
      throw cause;
    }
  }

  private ownItem(actor: DriveActor, itemId: string): DriveItem {
    const { store } = this.deps;
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

  private requireRecipient(actor: DriveActor, toProfileId: string): void {
    if (toProfileId === actor.profileId) {
      throw new ApiError('invalid_request', 'An item cannot be given to its own owner.');
    }
    if (!this.deps.store.profiles.list().some((profile) => profile.id === toProfileId)) {
      throw new ApiError('not_found', 'There is no such person to give it to.');
    }
    if (this.personalDriveOf(toProfileId) === undefined) {
      throw new ApiError('invalid_request', 'That person has no drive to receive it.');
    }
  }

  list(actor: DriveActor, cursor: string | undefined): TransferPage {
    const window = this.deps.store.driveTransfers.involving(
      actor.profileId,
      cursor ?? null,
      TRANSFER_PAGE_SIZE,
    );
    return { items: window.transfers, next: window.next };
  }

  cancel(actor: DriveActor, transferId: string): DriveTransfer {
    const transfer = this.deps.store.driveTransfers.find(transferId);
    if (transfer?.fromProfileId !== actor.profileId) throw missing();
    if (this.accepting.has(transfer.id)) {
      throw new ApiError('conflict', 'That offer is being accepted.');
    }
    return this.settle(transfer.id, 'cancelled');
  }

  async answer(
    actor: DriveActor,
    transferId: string,
    answer: DriveTransferAnswer,
  ): Promise<DriveTransfer> {
    const { store } = this.deps;
    const transfer = store.driveTransfers.find(transferId);
    if (transfer?.toProfileId !== actor.profileId) throw missing();
    if (transfer.state !== 'offered') {
      throw new ApiError('conflict', 'That offer was already answered.');
    }
    if (!answer.accept) {
      const declined = this.settle(transfer.id, 'declined');
      this.tell(declined);
      return declined;
    }
    if (this.accepting.has(transfer.id)) {
      throw new ApiError('conflict', 'That offer is being accepted.');
    }
    this.accepting.add(transfer.id);
    try {
      await this.move(transfer);
      const accepted = this.settle(transfer.id, 'accepted');
      this.tell(accepted);
      return accepted;
    } finally {
      this.accepting.delete(transfer.id);
    }
  }

  private settle(id: string, state: 'accepted' | 'declined' | 'cancelled'): DriveTransfer {
    try {
      return this.deps.store.driveTransfers.settle(id, state);
    } catch (cause) {
      if (cause instanceof DriveTransferAnsweredError) {
        throw new ApiError('conflict', 'That offer was already answered.');
      }
      throw cause;
    }
  }

  private tell(transfer: DriveTransfer): void {
    this.deps.store.driveNotifications.add({
      profileId: transfer.fromProfileId,
      kind: 'transfer_answered',
      itemId: transfer.itemId,
      actorProfileId: transfer.toProfileId,
      actorName: null,
      refId: transfer.id,
    });
  }

  private personalDriveOf(profileId: string): StoredDrive | undefined {
    return this.deps.store.driveRoots
      .list()
      .find((drive) => drive.scope === 'person' && drive.ownerProfileId === profileId);
  }

  private async move(transfer: DriveTransfer): Promise<void> {
    const { store, env, space } = this.deps;
    const top = store.driveItems.find(transfer.itemId, null);
    if (top === undefined) {
      throw new ApiError('not_found', 'The item that was offered is gone.');
    }
    const from = store.driveRoots.byId(top.rootId);
    const to = this.personalDriveOf(transfer.toProfileId);
    if (from.scope !== 'person' || from.ownerProfileId !== transfer.fromProfileId) {
      throw new ApiError('conflict', 'That item no longer belongs to the person who offered it.');
    }
    if (to === undefined) {
      throw new ApiError('invalid_request', 'The person receiving it has no drive.');
    }
    const tree = collectTree(store, top);
    checkDriveQuota((profileId) => store.driveQuotas.status(profileId), {
      profileId: transfer.toProfileId,
      addBytes: tree.bytes,
      releasedBytes: 0,
    });
    const landing = await this.landing(top, tree, to);
    const source = await locate(from, top.relPath);
    const target = await locate(to, landing.name);
    await this.carry(source, target, tree.bytes, space);
    const copied: string[] = [];
    try {
      copied.push(...(await this.carryVersions(from, to, tree.shas)));
      const identities = await this.identitiesOf(to, tree, landing);
      this.rewrite({ transfer, top, from, to, tree, landing, identities });
    } catch (cause) {
      await this.carry(target, source, 0, space);
      for (const path of copied) await env.files.remove(path);
      throw cause;
    }
    await this.purgeTrashed(from, tree);
    await this.dropSourceVersions(from, tree.shas);
    announce(env, from.id, top.parentId, tree.items);
    announce(env, to.id, null, tree.items);
    log.info('drive_transfer.moved', {
      transferId: transfer.id,
      itemId: top.id,
      items: tree.items.length,
      bytes: tree.bytes,
    });
  }

  private async landing(top: DriveItem, tree: Tree, to: StoredDrive): Promise<Landing> {
    const name = await this.freeName(top, to);
    const mapped = new Map<string, string>();
    for (const item of tree.items) {
      mapped.set(item.id, `${name}${item.relPath.slice(top.relPath.length)}`);
    }
    return { name, mapped };
  }

  private async freeName(top: DriveItem, to: StoredDrive): Promise<string> {
    const { store, env } = this.deps;
    for (let attempt = 1; ; attempt += 1) {
      const name = freeNameAt(top.name, attempt);
      const indexed = store.driveItems.byPath(to.id, name, null);
      const onDisk = await env.files.stamp(await locate(to, name));
      if (indexed === undefined && onDisk === null) return name;
    }
  }

  private async carry(
    source: string,
    target: string,
    bytes: number,
    space: DataSpaceProbe['space'],
  ): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    try {
      await this.deps.env.files.rename(source, target);
    } catch (cause) {
      if (fsCode(cause) !== 'EXDEV') throw cause;
      if (bytes > 0) await checkDriveFreeSpace(space, dirname(target), bytes);
      await cp(source, target, { recursive: true, errorOnExist: true, preserveTimestamps: true });
      await rm(source, { recursive: true, force: true });
    }
  }

  private async carryVersions(
    from: DriveWriteRoot,
    to: DriveWriteRoot,
    shas: readonly string[],
  ): Promise<string[]> {
    const { env } = this.deps;
    const created: string[] = [];
    for (const sha of shas) {
      const target = await locate(to, versionRelPath(sha));
      if ((await env.files.stamp(target)) !== null) continue;
      const source = await locate(from, versionRelPath(sha));
      await mkdir(dirname(target), { recursive: true });
      try {
        await env.files.link(source, target);
      } catch (cause) {
        log.info('drive_transfer.version_copied', { sha, reason: fsCode(cause) });
        await copyFile(source, target);
      }
      created.push(target);
    }
    return created;
  }

  private async purgeTrashed(from: StoredDrive, tree: Tree): Promise<void> {
    const { store, env } = this.deps;
    const rows = new TransferRows(store.context);
    for (const id of rows.trashedUnder(from.id, tree.folderIds)) {
      await removeTrashEntry(env, store.driveTrash.byId(id));
    }
  }

  private async dropSourceVersions(from: StoredDrive, shas: readonly string[]): Promise<void> {
    const { env, store } = this.deps;
    for (const sha of shas) {
      if (store.driveVersions.references(from.id, sha) === 0) {
        await env.files.remove(await locate(from, versionRelPath(sha)));
      }
    }
  }

  private async identitiesOf(
    to: DriveWriteRoot,
    tree: Tree,
    landing: Landing,
  ): Promise<ReadonlyMap<string, DriveItemIdentity>> {
    const identities = new Map<string, DriveItemIdentity>();
    for (const item of tree.items) {
      const relPath = landing.mapped.get(item.id) ?? '';
      const stamp = await this.deps.env.files.stamp(await locate(to, relPath));
      if (stamp === null) {
        throw new ApiError('internal', `${item.name} is missing after it was moved.`);
      }
      identities.set(item.id, identityOf(stamp));
    }
    return identities;
  }

  private rewrite(move: Move): void {
    const { store, placements } = this.deps;
    const { transfer, top, from, to, tree } = move;
    const rows = new TransferRows(store.context);
    const ids = new Set(tree.items.map((item) => item.id));
    store.write(() => {
      this.rewriteItems(move);
      rows.reroot({
        itemIds: tree.items.map((item) => item.id),
        folderIds: tree.folderIds,
        toRootId: to.id,
        recipientProfileId: transfer.toProfileId,
      });
      for (const grant of store.driveGrants.receivedBy(transfer.toProfileId)) {
        if (ids.has(grant.itemId)) store.driveGrants.remove(grant.id);
      }
      store.driveGrants.set(
        { itemId: top.id, profileId: transfer.fromProfileId, role: 'edit', expiresAt: null },
        transfer.toProfileId,
      );
      for (const placementId of rows.placementsOn(from.id, tree.folderIds)) {
        placements.repoint(placementId, to.id);
      }
    });
  }

  private rewriteItems(move: Move): void {
    const { store, env } = this.deps;
    const { transfer, top, to, tree, landing, identities } = move;
    const actor = transferActor(transfer.toProfileId);
    for (const before of tree.items) {
      const relPath = landing.mapped.get(before.id) ?? '';
      const identity = identities.get(before.id);
      if (identity === undefined) continue;
      const written = store.driveItems.write({
        item: {
          ...before,
          rootId: to.id,
          parentId: before.id === top.id ? null : before.parentId,
          relPath,
          name: basename(relPath),
          addedByProfileId: transfer.toProfileId,
        },
        identity,
      });
      appendFeed(env, written.item, 'create', actor);
      appendFeed(env, before, 'delete', actor);
    }
  }
}
