import {
  ApiError,
  type DriveBackupReport,
  type DriveBackupReportInput,
  type DriveConflict,
  type DriveConflictResolve,
  type DriveItem,
  type DriveQuotaSet,
  type DriveScrubState,
  type DriveSettings,
  type DriveSettingsUpdate,
  type DriveShare,
  type DriveShareCreate,
  type DriveShareCreated,
} from '@smarteverything/domain';
import { commitContent } from './changes';
import { resolveConflict, type ConflictEnv } from './conflicts';
import type { DriveBackups } from './backups';
import { checkDriveWrite, type DriveWriteGuard } from './quotas';
import type { DriveScrubber } from './scrub';
import { updateDriveSettings } from './settings';
import type { DriveReadService } from './service-read';
import {
  changeActorOf,
  requireOwner,
  writableItemRoot,
  writableRoot,
  type DriveCaller,
  type WriteStore,
} from './service-write-support';
import type { DriveShares } from './shares';
import { locate } from './intents';
import { stageVersion } from './versions';

export interface StorageDeps {
  readonly env: ConflictEnv;
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly shares: Pick<DriveShares, 'create' | 'revoke'>;
  readonly scrub: Pick<DriveScrubber, 'start'>;
  readonly backups: Pick<DriveBackups, 'report'>;
  readonly guard: DriveWriteGuard;
}

export class DriveStorageWriter {
  constructor(private readonly deps: StorageDeps) {}

  async restoreVersion(caller: DriveCaller, itemId: string, versionId: string): Promise<DriveItem> {
    const { env, store, read, guard } = this.deps;
    const item = await read.readItem(caller, itemId);
    const entry = await store.host.call('driveVersions', 'find', versionId);
    if (
      item.kind === 'folder' ||
      entry?.version.itemId !== itemId ||
      entry.rootId !== item.rootId
    ) {
      throw new ApiError('not_found', 'There is no such earlier version of this file.');
    }
    const root = await writableItemRoot(store, caller, item);
    await checkDriveWrite(guard, {
      profileId: caller.profileId,
      addBytes: entry.version.bytes,
      releasedBytes: 0,
      path: root.path,
    });
    const staged = await stageVersion(env, root, entry.version);
    try {
      const written = await commitContent(env, {
        root,
        staged,
        relPath: item.relPath,
        actor: changeActorOf(caller),
      });
      return written.item;
    } catch (cause) {
      await env.files.remove(await locate(root, staged.relPath));
      throw cause;
    }
  }

  createShare(caller: DriveCaller, input: DriveShareCreate): Promise<DriveShareCreated> {
    return this.deps.shares.create(caller, input);
  }

  revokeShare(caller: DriveCaller, shareId: string): Promise<DriveShare> {
    return this.deps.shares.revoke(caller, shareId);
  }

  async setQuota(caller: DriveCaller, set: DriveQuotaSet): Promise<void> {
    requireOwner(caller);
    await this.deps.store.host.call('driveQuotas', 'set', set.profileId, set.bytes);
  }

  updateSettings(caller: DriveCaller, update: DriveSettingsUpdate): DriveSettings {
    requireOwner(caller);
    return updateDriveSettings(this.deps.store, update);
  }

  async startScrub(caller: DriveCaller): Promise<DriveScrubState> {
    requireOwner(caller);
    return this.deps.scrub.start();
  }

  async reportBackup(
    caller: DriveCaller,
    input: DriveBackupReportInput,
  ): Promise<DriveBackupReport> {
    requireOwner(caller);
    return this.deps.backups.report(input);
  }

  async resolveConflict(
    caller: DriveCaller,
    request: DriveConflictResolve,
  ): Promise<DriveConflict> {
    const { env, read } = this.deps;
    const conflict = await env.store.host.call('driveConflicts', 'find', request.conflictId);
    if (conflict !== undefined) {
      await writableRoot(read, caller, conflict.rootId);
    }
    return resolveConflict(env, request, changeActorOf(caller));
  }
}
