import type { DriveRoot, DriveRootChange } from '@smarteverything/domain';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { DriveReadService } from './service-read';
import { requireOwner, type DriveCaller, type WriteStore } from './service-write-support';

export interface DriveAdminDeps {
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly scan: (rootId: string) => void;
}

function needsRescan(change: DriveRootChange): boolean {
  return change.skipPatterns !== undefined || change.includeHidden !== undefined;
}

export class DriveAdmin {
  constructor(private readonly deps: DriveAdminDeps) {}

  update(caller: DriveCaller, rootId: string, change: DriveRootChange): DriveRoot {
    const drive = this.settable(caller, rootId);
    const { path: _path, ...updated } = this.deps.store.driveRoots.update(drive.id, change);
    if (needsRescan(change)) {
      this.deps.scan(drive.id);
    }
    return updated;
  }

  scan(caller: DriveCaller, rootId: string): void {
    this.deps.scan(this.settable(caller, rootId).id);
  }

  private settable(caller: DriveCaller, rootId: string): StoredDrive {
    const drive = this.deps.read.rootFor(caller, rootId);
    if (drive.scope === 'home') {
      requireOwner(caller);
    }
    return drive;
  }
}
