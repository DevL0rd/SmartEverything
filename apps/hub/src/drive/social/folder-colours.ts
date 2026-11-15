import { ApiError, type DriveFolderColourSet, type DriveItem } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import type { DriveReadService } from '../service-read';

export interface FolderColoursEnv {
  readonly store: Pick<Store, 'driveFolderColours' | 'driveItems'>;
  readonly read: DriveReadService;
}

export class DriveFolderColours {
  constructor(private readonly env: FolderColoursEnv) {}

  set(actor: DriveActor, input: DriveFolderColourSet): DriveItem {
    const item = this.env.read.readItem(actor, input.itemId);
    if (item.kind !== 'folder') {
      throw new ApiError('invalid_request', 'Only a folder can have a colour.');
    }
    this.env.store.driveFolderColours.set(actor.profileId, item.id, input.colour);
    return this.env.store.driveItems.byId(item.id, actor.profileId);
  }
}
