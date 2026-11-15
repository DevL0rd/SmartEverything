import type { Store } from '../../store/store';
import type { DrivePosix } from '../posix/service';
import type { MountCommits } from './commits';
import type { MountDedupe } from './dedupe';
import type { MountFinish } from './finish';
import type { GroupFsync } from './fsync';
import type { HandleTable } from './handles';
import type { LockService } from './lock-service';
import type { PushPump } from './push';
import type { MountRegistry } from './registry';
import type { Staging } from './staging';

export interface MountServices {
  readonly store: Store;
  readonly posix: DrivePosix;
  readonly handles: HandleTable;
  readonly commits: MountCommits;
  readonly finish: MountFinish;
  readonly staging: Staging;
  readonly locks: LockService;
  readonly dedupe: MountDedupe;
  readonly fsync: GroupFsync;
  readonly push: PushPump;
  readonly registry: MountRegistry;
}
