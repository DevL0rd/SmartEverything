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
  type DriveSyncClient,
  type DriveSyncClientUpdate,
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
    const item = read.readItem(caller, itemId);
    const entry = store.driveVersions.find(versionId);
    if (
      item.kind === 'folder' ||
      entry?.version.itemId !== itemId ||
      entry.rootId !== item.rootId
    ) {
      throw new ApiError('not_found', 'There is no such earlier version of this file.');
    }
    const root = writableRoot(read, caller, item.rootId);
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

  revokeShare(caller: DriveCaller, shareId: string): DriveShare {
    return this.deps.shares.revoke(caller, shareId);
  }

  setQuota(caller: DriveCaller, set: DriveQuotaSet): void {
    requireOwner(caller);
    this.deps.store.driveQuotas.set(set.profileId, set.bytes);
  }

  updateSettings(caller: DriveCaller, update: DriveSettingsUpdate): DriveSettings {
    requireOwner(caller);
    return updateDriveSettings(this.deps.store, update);
  }

  startScrub(caller: DriveCaller): DriveScrubState {
    requireOwner(caller);
    return this.deps.scrub.start();
  }

  reportBackup(caller: DriveCaller, input: DriveBackupReportInput): DriveBackupReport {
    requireOwner(caller);
    return this.deps.backups.report(input);
  }

  async resolveConflict(
    caller: DriveCaller,
    request: DriveConflictResolve,
  ): Promise<DriveConflict> {
    const { env, read } = this.deps;
    const conflict = env.conflicts.find(request.conflictId);
    if (conflict !== undefined) {
      read.rootFor(caller, conflict.rootId);
    }
    return resolveConflict(env, request, changeActorOf(caller));
  }

  updateSyncClient(caller: DriveCaller, update: DriveSyncClientUpdate): DriveSyncClient {
    const { store, read } = this.deps;
    const root = read.rootFor(caller, update.rootId);
    if (!root.synced) {
      throw new ApiError('invalid_request', 'This library folder is not synced.');
    }
    const client = store.driveSyncClients.find(update.clientId, update.rootId);
    if (client === undefined || (!caller.owner && client.profileId !== caller.profileId)) {
      throw new ApiError('not_found', 'There is no such sync device for this person.');
    }
    return store.write(() => {
      const saved = store.driveSyncClients.set(update, {
        deviceId: client.deviceId,
        profileId: client.profileId,
      });
      const others = root.sync.clients.filter((one) => one.clientId !== saved.clientId);
      store.driveRoots.update(root.id, {
        sync: {
          ...root.sync,
          clients: [...others, { clientId: saved.clientId, enabled: saved.enabled }],
        },
      });
      return saved;
    });
  }
}
