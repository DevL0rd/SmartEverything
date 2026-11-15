import { PHOTO_FOLDER_KEY } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { selection, type Selection } from './selected-tool';

const NAME = z.string().trim().min(1);

export const FOLDER_KEY = PHOTO_FOLDER_KEY.describe(
  'A folder key from drive_read view photo_folders, such as phone:DCIM/Camera',
);

export function photoFolders(): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => operate(context, 'listPhotoFolders', {}, as),
  });
}

export function folderHidden(hidden: boolean): Selection {
  return selection({
    input: z.strictObject({ folderKey: PHOTO_FOLDER_KEY, folderName: NAME }),
    run: (context, input, as) =>
      operate(
        context,
        'setPhotoFolderHidden',
        { body: { key: input.folderKey, name: input.folderName, hidden } },
        as,
      ),
  });
}
