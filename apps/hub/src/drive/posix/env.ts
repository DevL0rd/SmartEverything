import type { Store } from '../../store/store';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { DriveActor } from '../access';
import type { ChangeEnv, ChangeStore } from '../changes';
import type { FsStatfsEnv } from '../fs-space';
import type { DriveWriteGuard } from '../quotas';

export type PosixStore = ChangeStore & Pick<Store, 'driveXattrs'>;

export interface PosixChangeEnv extends ChangeEnv {
  readonly store: PosixStore;
}

export interface PosixEnv {
  readonly change: PosixChangeEnv;
  readonly guard: DriveWriteGuard;
  readonly space: FsStatfsEnv;
  readonly holds: (inodeId: number) => boolean;
}

export interface PosixCaller extends DriveActor {
  readonly nodeId: string;
}

export interface ScopeMount {
  readonly drive: StoredDrive;
  readonly baseId: string | null;
  readonly rootInode: number;
}

export class PosixScope {
  readonly cursors = new Map<string, string>();
  readonly drive: StoredDrive;
  readonly baseId: string | null;
  readonly rootInode: number;

  constructor(
    readonly caller: PosixCaller,
    readonly placementId: string,
    mount: ScopeMount,
  ) {
    this.drive = mount.drive;
    this.baseId = mount.baseId;
    this.rootInode = mount.rootInode;
  }
}
