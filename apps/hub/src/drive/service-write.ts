import type {
  DriveAlbum,
  DriveAlbumChange,
  DriveAlbumCreate,
  DriveBackupReport,
  DriveBackupReportInput,
  DriveChange,
  DriveChangeResult,
  DriveConflict,
  DriveConflictResolve,
  DriveItem,
  DriveQuotaSet,
  DriveRoot,
  DriveRootChange,
  DriveScrubState,
  DriveSettings,
  DriveSettingsUpdate,
  DriveShare,
  DriveShareCreate,
  DriveShareCreated,
} from '@smarteverything/domain';
import type { ConflictEnv } from './conflicts';
import type { DriveWriteGuard } from './quotas';
import type { DriveRootLanes } from './root-lanes';
import type { DriveReadService } from './service-read';
import type { AlbumEditing } from './service-write-albums';
import { DriveAdmin } from './service-write-drives';
import { DriveStorageWriter, type StorageDeps } from './service-write-storage';
import type { DriveCaller, WriteStore } from './service-write-support';
import { DriveTreeWriter } from './service-write-tree';

export interface DriveWriteDeps {
  readonly env: ConflictEnv;
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly albums: AlbumEditing;
  readonly shares: StorageDeps['shares'];
  readonly scrub: StorageDeps['scrub'];
  readonly backups: StorageDeps['backups'];
  readonly guard: DriveWriteGuard;
  readonly scan: (rootId: string) => void;
  readonly lanes: DriveRootLanes;
}

export class DriveWriteService {
  private readonly drives: DriveAdmin;
  private readonly tree: DriveTreeWriter;
  private readonly albums: AlbumEditing;
  private readonly storage: DriveStorageWriter;

  constructor(deps: DriveWriteDeps) {
    this.drives = new DriveAdmin({ store: deps.store, read: deps.read, scan: deps.scan });
    this.tree = new DriveTreeWriter(deps);
    this.albums = deps.albums;
    this.storage = new DriveStorageWriter(deps);
  }

  updateRoot(caller: DriveCaller, rootId: string, change: DriveRootChange): Promise<DriveRoot> {
    return this.drives.update(caller, rootId, change);
  }

  scanRoot(caller: DriveCaller, rootId: string): Promise<void> {
    return this.drives.scan(caller, rootId);
  }

  change(caller: DriveCaller, change: DriveChange): Promise<DriveChangeResult> {
    return this.tree.apply(caller, change);
  }

  createAlbum(caller: DriveCaller, input: DriveAlbumCreate): Promise<DriveAlbum> {
    return this.albums.create(caller, input);
  }

  updateAlbum(caller: DriveCaller, albumId: string, change: DriveAlbumChange): Promise<DriveAlbum> {
    return this.albums.update(caller, albumId, change);
  }

  removeAlbum(caller: DriveCaller, albumId: string): Promise<void> {
    return this.albums.remove(caller, albumId);
  }

  restoreVersion(caller: DriveCaller, itemId: string, versionId: string): Promise<DriveItem> {
    return this.storage.restoreVersion(caller, itemId, versionId);
  }

  createShare(caller: DriveCaller, input: DriveShareCreate): Promise<DriveShareCreated> {
    return this.storage.createShare(caller, input);
  }

  revokeShare(caller: DriveCaller, shareId: string): Promise<DriveShare> {
    return this.storage.revokeShare(caller, shareId);
  }

  setQuota(caller: DriveCaller, set: DriveQuotaSet): Promise<void> {
    return this.storage.setQuota(caller, set);
  }

  updateSettings(caller: DriveCaller, update: DriveSettingsUpdate): Promise<DriveSettings> {
    return this.storage.updateSettings(caller, update);
  }

  startScrub(caller: DriveCaller): Promise<DriveScrubState> {
    return this.storage.startScrub(caller);
  }

  reportBackup(caller: DriveCaller, input: DriveBackupReportInput): Promise<DriveBackupReport> {
    return this.storage.reportBackup(caller, input);
  }

  resolveConflict(caller: DriveCaller, request: DriveConflictResolve): Promise<DriveConflict> {
    return this.storage.resolveConflict(caller, request);
  }
}
