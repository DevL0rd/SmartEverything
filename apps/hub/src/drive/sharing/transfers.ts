import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
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
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import type { ChangeEnv } from '../changes';
import { identityOf } from '../change-rows';
import type { DataSpaceProbe } from '../data-space';
import { locate, versionRelPath, type DriveWriteRoot } from '../intents';
import { checkDriveFreeSpace, loadedQuotaCheck } from '../quotas';
import { removeTrashEntry } from '../trash';
import { freeNameAt } from '../uploads-tus-wire';
import type { DrivePlacements } from '../placements';
import type { Tree } from './transfer-tree';

const log = new Logger('hub.drive');

export const TRANSFER_PAGE_SIZE = 50;

export interface TransfersEnv {
  readonly env: ChangeEnv;
  readonly store: Pick<Store, 'host'>;
  readonly space: DataSpaceProbe['space'];
  readonly placements: Pick<DrivePlacements, 'repoint'>;
}

export interface TransferPage {
  readonly items: readonly DriveTransfer[];
  readonly next: string | null;
}

interface Landing {
  readonly name: string;
  readonly mapped: ReadonlyMap<string, string>;
}

interface Moved {
  readonly transfer: DriveTransfer;
  readonly top: DriveItem;
  readonly from: StoredDrive;
  readonly to: StoredDrive;
  readonly tree: Tree;
  readonly landing: Landing;
  readonly identities: ReadonlyMap<string, DriveItemIdentity>;
}

function missing(): ApiError {
  return new ApiError('not_found', 'There is no such ownership transfer for this caller.');
}

export class DriveTransfers {
  private readonly accepting = new Set<string>();

  constructor(private readonly deps: TransfersEnv) {}

  offer(actor: DriveActor, input: DriveTransferOffer): Promise<DriveTransfer> {
    return this.deps.store.host.write('driveTransferOffer', { actor, offer: input });
  }

  async list(actor: DriveActor, cursor: string | undefined): Promise<TransferPage> {
    const window = await this.deps.store.host.call(
      'driveTransfers',
      'involving',
      actor.profileId,
      cursor ?? null,
      TRANSFER_PAGE_SIZE,
    );
    return { items: window.transfers, next: window.next };
  }

  async cancel(actor: DriveActor, transferId: string): Promise<DriveTransfer> {
    const transfer = await this.deps.store.host.call('driveTransfers', 'find', transferId);
    if (transfer?.fromProfileId !== actor.profileId) throw missing();
    if (this.accepting.has(transfer.id)) {
      throw new ApiError('conflict', 'That offer is being accepted.');
    }
    return this.settle(transfer.id, 'cancelled', false);
  }

  async answer(
    actor: DriveActor,
    transferId: string,
    answer: DriveTransferAnswer,
  ): Promise<DriveTransfer> {
    const transfer = await this.deps.store.host.call('driveTransfers', 'find', transferId);
    if (transfer?.toProfileId !== actor.profileId) throw missing();
    if (transfer.state !== 'offered') {
      throw new ApiError('conflict', 'That offer was already answered.');
    }
    if (!answer.accept) return this.settle(transfer.id, 'declined', true);
    if (this.accepting.has(transfer.id)) {
      throw new ApiError('conflict', 'That offer is being accepted.');
    }
    this.accepting.add(transfer.id);
    try {
      await this.move(transfer);
      return await this.settle(transfer.id, 'accepted', true);
    } finally {
      this.accepting.delete(transfer.id);
    }
  }

  private settle(
    id: string,
    state: 'accepted' | 'declined' | 'cancelled',
    tell: boolean,
  ): Promise<DriveTransfer> {
    return this.deps.store.host.write('driveTransferSettle', { id, state, tell });
  }

  private async move(transfer: DriveTransfer): Promise<void> {
    const { store, env, space } = this.deps;
    const { top, from, to, tree } = await store.host.read('driveTransferPlan', transfer);
    await loadedQuotaCheck(store, {
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
      await this.rewrite({ transfer, top, from, to, tree, landing, identities });
    } catch (cause) {
      await this.carry(target, source, 0, space);
      for (const path of copied) await env.files.remove(path);
      throw cause;
    }
    await this.purgeTrashed(from, tree);
    await this.dropSourceVersions(from, tree.shas);
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
      const indexed = await store.host.call('driveItems', 'byPath', to.id, name, null);
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
    const entries = await store.host.read('driveTransferTrashed', {
      rootId: from.id,
      folderIds: tree.folderIds,
    });
    for (const entry of entries) await removeTrashEntry(env, entry);
  }

  private async dropSourceVersions(from: StoredDrive, shas: readonly string[]): Promise<void> {
    const { env, store } = this.deps;
    const unused = await store.host.read('driveTransferUnreferenced', { rootId: from.id, shas });
    for (const sha of unused) {
      await env.files.remove(await locate(from, versionRelPath(sha)));
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

  private async rewrite(moved: Moved): Promise<void> {
    const { transfer, top, from, to, tree, landing, identities } = moved;
    const placementIds = await this.deps.store.host.write('driveTransferRewrite', {
      transfer,
      topId: top.id,
      topParentId: top.parentId,
      fromRootId: from.id,
      toRootId: to.id,
      tree,
      landing: tree.items.flatMap((item) => {
        const identity = identities.get(item.id);
        const relPath = landing.mapped.get(item.id);
        return identity === undefined || relPath === undefined
          ? []
          : [{ itemId: item.id, relPath, identity }];
      }),
    });
    for (const placementId of placementIds) {
      await this.deps.placements.repoint(placementId, to.id);
    }
  }
}
