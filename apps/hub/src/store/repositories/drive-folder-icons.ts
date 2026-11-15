import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

export const DRIVE_FOLDER_ICON_SOURCES = [
  'directory_file',
  'desktop_ini',
  'mac_icon',
  'named_file',
] as const;

export type DriveFolderIconSource = (typeof DRIVE_FOLDER_ICON_SOURCES)[number];

const ICON_COLUMNS = z.strictObject({
  folder_item_id: z.string(),
  source: z.enum(DRIVE_FOLDER_ICON_SOURCES),
  source_rel_path: z.string(),
  source_rev: z.number(),
  image_sha256: z.string(),
  updated_at: z.string(),
});

export interface DriveFolderIcon {
  readonly folderItemId: string;
  readonly source: DriveFolderIconSource;
  readonly sourceRelPath: string;
  readonly sourceRev: number;
  readonly imageSha256: string;
  readonly updatedAt: string;
}

const STORED_ICON = storedRow(
  ICON_COLUMNS.transform((row): DriveFolderIcon => ({
    folderItemId: row.folder_item_id,
    source: row.source,
    sourceRelPath: row.source_rel_path,
    sourceRev: row.source_rev,
    imageSha256: row.image_sha256,
    updatedAt: row.updated_at,
  })),
  {},
);

const COLUMNS = 'folder_item_id, source, source_rel_path, source_rev, image_sha256, updated_at';

export type DriveFolderIconInput = Omit<DriveFolderIcon, 'updatedAt'>;

export class DriveFolderIconsRepository {
  constructor(private readonly context: StoreContext) {}

  find(folderItemId: string): DriveFolderIcon | undefined {
    return this.context.sql.get(
      STORED_ICON,
      `select ${COLUMNS} from drive_folder_icons where folder_item_id = $folderItemId`,
      { folderItemId },
    );
  }

  set(input: DriveFolderIconInput): boolean {
    return this.context.write(() => {
      const before = this.find(input.folderItemId);
      if (
        before?.source === input.source &&
        before.sourceRelPath === input.sourceRelPath &&
        before.sourceRev === input.sourceRev &&
        before.imageSha256 === input.imageSha256
      ) {
        return false;
      }
      this.context.sql.run(
        'set the folder icon',
        `insert into drive_folder_icons (${COLUMNS})
          values ($folderItemId, $source, $sourceRelPath, $sourceRev, $imageSha256, $now)
          on conflict (folder_item_id) do update set source = excluded.source,
            source_rel_path = excluded.source_rel_path, source_rev = excluded.source_rev,
            image_sha256 = excluded.image_sha256, updated_at = excluded.updated_at`,
        {
          folderItemId: input.folderItemId,
          source: input.source,
          sourceRelPath: input.sourceRelPath,
          sourceRev: input.sourceRev,
          imageSha256: input.imageSha256,
          now: this.context.now(),
        },
      );
      return true;
    });
  }

  clear(folderItemId: string): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'clear the folder icon',
          'delete from drive_folder_icons where folder_item_id = $folderItemId',
          { folderItemId },
        ) > 0,
    );
  }
}
