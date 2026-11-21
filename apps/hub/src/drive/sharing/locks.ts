import type { DriveItem, DriveLockSet } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';

export interface LocksEnv {
  readonly store: Pick<Store, 'host'>;
}

export class DriveLocks {
  constructor(private readonly env: LocksEnv) {}

  set(actor: DriveActor, lock: DriveLockSet): Promise<DriveItem> {
    return this.env.store.host.write('driveLockSet', { actor, lock });
  }
}
