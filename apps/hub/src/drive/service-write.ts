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
import type { DriveReadService } from './service-read';
import { DriveAlbumWriter, type AlbumEditing } from './service-write-albums';
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
}

export class DriveWriteService {
  private readonly drives: DriveAdmin;
  private readonly tree: DriveTreeWriter;
  private readonly albums: DriveAlbumWriter;
  private readonly storage: DriveStorageWriter;

  constructor(deps: DriveWriteDeps) {
    this.drives = new DriveAdmin({ store: deps.store, read: deps.read, scan: deps.scan });
    this.tree = new DriveTreeWriter(deps);
    this.albums = new DriveAlbumWriter(deps.albums);
    this.storage = new DriveStorageWriter(deps);
  }

  updateRoot(caller: DriveCaller, rootId: string, change: DriveRootChange): DriveRoot {
    return this.drives.update(caller, rootId, change);
  }

  scanRoot(caller: DriveCaller, rootId: string): void {
    this.drives.scan(caller, rootId);
  }

  change(caller: DriveCaller, change: DriveChange): Promise<DriveChangeResult> {
    return this.tree.apply(caller, change);
  }

  createAlbum(caller: DriveCaller, input: DriveAlbumCreate): DriveAlbum {
    return this.albums.create(caller, input);
  }

  updateAlbum(caller: DriveCaller, albumId: string, change: DriveAlbumChange): DriveAlbum {
    return this.albums.update(caller, albumId, change);
  }

  removeAlbum(caller: DriveCaller, albumId: string): void {
    this.albums.remove(caller, albumId);
  }

  restoreVersion(caller: DriveCaller, itemId: string, versionId: string): Promise<DriveItem> {
    return this.storage.restoreVersion(caller, itemId, versionId);
  }

  createShare(caller: DriveCaller, input: DriveShareCreate): Promise<DriveShareCreated> {
    return this.storage.createShare(caller, input);
  }

  revokeShare(caller: DriveCaller, shareId: string): DriveShare {
    return this.storage.revokeShare(caller, shareId);
  }

  setQuota(caller: DriveCaller, set: DriveQuotaSet): void {
    this.storage.setQuota(caller, set);
  }

  updateSettings(caller: DriveCaller, update: DriveSettingsUpdate): DriveSettings {
    return this.storage.updateSettings(caller, update);
  }

  startScrub(caller: DriveCaller): DriveScrubState {
    return this.storage.startScrub(caller);
  }

  reportBackup(caller: DriveCaller, input: DriveBackupReportInput): DriveBackupReport {
    return this.storage.reportBackup(caller, input);
  }

  resolveConflict(caller: DriveCaller, request: DriveConflictResolve): Promise<DriveConflict> {
    return this.storage.resolveConflict(caller, request);
  }
}
