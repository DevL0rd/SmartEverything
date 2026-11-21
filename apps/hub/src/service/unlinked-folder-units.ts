import { z } from 'zod';
import { found } from '../store/context';
import { storeUnit } from '../store/host/unit';

const UNLINKED = z.strictObject({
  root_id: z.string(),
  path: z.string(),
  read_only: z.number(),
});

const REMAINING = z.strictObject({ remaining: z.number() });

export const UNLINKED_FOLDERS_UNIT = storeUnit((store, _input: null) =>
  store.context.sql.all(UNLINKED, 'select root_id, path, read_only from drive_unlinked_folders'),
);

export const UNLINKED_FOLDERS_LEFT_UNIT = storeUnit(
  (store, _input: null) =>
    found(
      store.context.sql.get(REMAINING, 'select count(*) as remaining from drive_unlinked_folders'),
      'unlinked folder count',
      'drive',
    ).remaining,
);

export const UNLINKED_FOLDER_FORGET_UNIT = storeUnit((store, rootId: string) => {
  store.context.sql.run(
    'forget the unlinked folder',
    'delete from drive_unlinked_folders where root_id = $id',
    { id: rootId },
  );
});
