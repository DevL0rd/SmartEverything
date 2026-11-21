import { ApiError, type DriveFolderColourSet } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { DriveActor } from '../access';
import { DriveReadRules } from './read';

export const DRIVE_FOLDER_COLOUR_SET_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly colour: DriveFolderColourSet }) => {
    const { actor, colour } = input;
    const item = new DriveReadRules(store).readItem(actor, colour.itemId);
    if (item.kind !== 'folder') {
      throw new ApiError('invalid_request', 'Only a folder can have a colour.');
    }
    store.driveFolderColours.set(actor.profileId, item.id, colour.colour);
    return store.driveItems.byId(item.id, actor.profileId);
  },
);
