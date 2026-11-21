import type { DriveFolderColourSet, DriveItem } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';

export interface FolderColoursEnv {
  readonly store: Pick<Store, 'host'>;
}

export class DriveFolderColours {
  constructor(private readonly env: FolderColoursEnv) {}

  set(actor: DriveActor, colour: DriveFolderColourSet): Promise<DriveItem> {
    return this.env.store.host.write('driveFolderColourSet', { actor, colour });
  }
}
