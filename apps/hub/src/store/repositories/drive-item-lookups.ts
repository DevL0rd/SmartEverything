import { z } from 'zod';
import { DRIVE_ITEM_KINDS } from '@smarteverything/domain';
import { found, type StoreContext } from '../context';

const BACKLOG_ROW = z
  .strictObject({
    id: z.string(),
    rel_path: z.string(),
    bytes: z.number(),
    dev: z.string(),
    ino: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    relPath: row.rel_path,
    bytes: row.bytes,
    dev: row.dev,
    ino: row.ino,
  }));

const FILE_COUNT = z.strictObject({ files: z.number() });

const PRESENT = z.strictObject({ present: z.literal(1) });

const PLACED = z
  .strictObject({ id: z.string(), kind: z.enum(DRIVE_ITEM_KINDS), added_at: z.string() })
  .transform((row) => ({ id: row.id, kind: row.kind, addedAt: row.added_at }));

export type DrivePlaced = z.infer<typeof PLACED>;

const SPOT = z.strictObject({
  ino: z.number(),
  parent: z.number().nullable(),
  name: z.string(),
  rel_path: z.string(),
  kind: z.enum(DRIVE_ITEM_KINDS),
  parent_id: z.string().nullable(),
});

export interface DriveItemSpot {
  readonly ino: number;
  readonly parent: number;
  readonly name: string;
  readonly relPath: string;
  readonly kind: z.infer<typeof SPOT>['kind'];
  readonly parentId: string | null;
}

export type DriveBacklogRow = z.infer<typeof BACKLOG_ROW>;

export interface DriveHashBacklog {
  readonly files: number;
  readonly rows: readonly DriveBacklogRow[];
}

export class DriveItemLookups {
  constructor(private readonly context: StoreContext) {}

  hashBacklog(rootId: string, withBlocks: boolean): DriveHashBacklog {
    const counted = this.context.sql.get(
      FILE_COUNT,
      `select count(*) as files from drive_items
        where root_id = $rootId and kind not in ('folder', 'link', 'special')`,
      { rootId },
    );
    const missing = withBlocks
      ? `select id, rel_path, bytes, dev, ino from drive_items i
          where root_id = $rootId and kind not in ('folder', 'link', 'special')
            and (sha256 is null
              or not exists (select 1 from drive_blocks b where b.item_id = i.id and b.rev = i.rev))`
      : `select id, rel_path, bytes, dev, ino from drive_items indexed by drive_items_unhashed
          where root_id = $rootId and sha256 is null and kind not in ('folder', 'link', 'special')`;
    const rows = this.context.sql.all(
      BACKLOG_ROW,
      `select id, rel_path, bytes, dev, ino from (${missing})
        where dev is not null and ino is not null`,
      { rootId },
    );
    return { files: found(counted, 'drive file count', rootId).files, rows };
  }

  unreadMedia(rootId: string): readonly DriveBacklogRow[] {
    return this.context.sql.all(
      BACKLOG_ROW,
      `select id, rel_path, bytes, dev, ino from drive_items indexed by drive_items_unread_media
        where root_id = $rootId and taken_at is null and kind in ('image', 'video', 'audio')
          and dev is not null and ino is not null`,
      { rootId },
    );
  }

  spot(id: string): DriveItemSpot | undefined {
    const row = this.context.sql.get(
      SPOT,
      `select i.inode_id as ino,
          case when i.parent_id is null
            then (select r.id from drive_inodes r where r.root_id = i.root_id and r.is_root = 1)
            else (select p.inode_id from drive_items p where p.id = i.parent_id) end as parent,
          i.name, i.rel_path, i.kind, i.parent_id
        from drive_items i where i.id = $id`,
      { id },
    );
    if (row?.parent === undefined || row.parent === null) return undefined;
    return {
      ino: row.ino,
      parent: row.parent,
      name: row.name,
      relPath: row.rel_path,
      kind: row.kind,
      parentId: row.parent_id,
    };
  }

  exists(id: string): boolean {
    return (
      this.context.sql.get(PRESENT, 'select 1 as present from drive_items where id = $id', {
        id,
      }) !== undefined
    );
  }

  placed(rootId: string, relPath: string): DrivePlaced | undefined {
    return this.context.sql.get(
      PLACED,
      `select id, kind, added_at from drive_items where root_id = $rootId and rel_path = $relPath`,
      { rootId, relPath },
    );
  }
}
