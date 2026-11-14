import { DRIVE_TRASH_ENTRY, type DriveTrashEntry } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { flag } from '../sql';
import { DriveTrashRows, type StashedRow } from './drive-trash-rows';

const COLUMNS = `item_id, root_id, name, original_rel_path, trash_rel_path, is_folder, bytes,
  deleted_at, purge_at, deleted_by, added_by_profile_id`;

const TRASH_COLUMNS = z.strictObject({
  item_id: z.string(),
  root_id: z.string(),
  name: z.string(),
  original_rel_path: z.string(),
  trash_rel_path: z.string(),
  is_folder: z.boolean(),
  bytes: z.number(),
  deleted_at: z.string(),
  purge_at: z.string(),
  deleted_by: z.string().nullable(),
  added_by_profile_id: z.string().nullable(),
});

function entryOf(row: z.output<typeof TRASH_COLUMNS>): DriveTrashEntry {
  return DRIVE_TRASH_ENTRY.parse({
    itemId: row.item_id,
    rootId: row.root_id,
    name: row.name,
    originalRelPath: row.original_rel_path,
    trashRelPath: row.trash_rel_path,
    isFolder: row.is_folder,
    bytes: row.bytes,
    deletedAt: row.deleted_at,
    purgeAt: row.purge_at,
    deletedBy: row.deleted_by,
    addedByProfileId: row.added_by_profile_id,
  });
}

const STORED_ENTRY = storedRow(TRASH_COLUMNS.transform(entryOf), { flags: ['is_folder'] });

const SOONEST = z.object({ purge_at: z.string().nullable() });

const ADDER_BYTES = z.object({ added_by_profile_id: z.string().nullable(), bytes: z.number() });

export interface DriveTrashCursor {
  readonly deletedAt: string;
  readonly itemId: string;
}

export interface DriveTrashWindow {
  readonly entries: readonly DriveTrashEntry[];
  readonly next: DriveTrashCursor | null;
}

export interface DriveTrashBytes {
  readonly addedByProfileId: string | null;
  readonly bytes: number;
}

export class DriveTrashRepository {
  private readonly rows: DriveTrashRows;

  constructor(private readonly context: StoreContext) {
    this.rows = new DriveTrashRows(context);
  }

  stash(itemId: string): void {
    this.rows.stash(itemId);
  }

  stashed(itemId: string): StashedRow[] {
    return this.rows.rows(itemId);
  }

  reinstate(itemId: string, rows: readonly StashedRow[], to: string): void {
    this.rows.reinstate(itemId, rows, to);
  }

  find(itemId: string): DriveTrashEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_trash where item_id = $itemId`,
      { itemId },
    );
  }

  byId(itemId: string): DriveTrashEntry {
    return found(this.find(itemId), 'drive trash entry', itemId);
  }

  insert(entry: DriveTrashEntry): DriveTrashEntry {
    return this.context.write(() => {
      this.context.sql.run(
        'trash the drive item',
        `insert into drive_trash (${COLUMNS}) values ($itemId, $rootId, $name, $originalRelPath,
          $trashRelPath, $isFolder, $bytes, $deletedAt, $purgeAt, $deletedBy, $addedBy)`,
        {
          itemId: entry.itemId,
          rootId: entry.rootId,
          name: entry.name,
          originalRelPath: entry.originalRelPath,
          trashRelPath: entry.trashRelPath,
          isFolder: flag(entry.isFolder),
          bytes: entry.bytes,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
          deletedBy: entry.deletedBy,
          addedBy: entry.addedByProfileId,
        },
      );
      return this.byId(entry.itemId);
    });
  }

  remove(itemId: string): DriveTrashEntry {
    return this.context.write(() => {
      const entry = this.byId(itemId);
      this.context.sql.run(
        'remove the drive trash entry',
        'delete from drive_trash where item_id = $itemId',
        { itemId },
      );
      return entry;
    });
  }

  forgetPhoto(itemId: string): void {
    this.context.write(() => {
      for (const id of [itemId, ...this.rows.photoIds(itemId)]) {
        this.context.sql.run(
          'forget the permanently deleted photo',
          'delete from drive_photo_library where item_id = $id',
          { id },
        );
      }
    });
  }

  inRoot(rootId: string, after: DriveTrashCursor | null, limit: number): DriveTrashWindow {
    const rows = this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_trash
        where root_id = $rootId
          ${after === null ? '' : 'and (deleted_at, item_id) < ($deletedAt, $itemId)'}
        order by deleted_at desc, item_id desc limit $limit`,
      after === null
        ? { rootId, limit }
        : { rootId, limit, deletedAt: after.deletedAt, itemId: after.itemId },
    );
    const last = rows.at(-1);
    return {
      entries: rows,
      next:
        rows.length === limit && last !== undefined
          ? { deletedAt: last.deletedAt, itemId: last.itemId }
          : null,
    };
  }

  due(at: string, limit: number): DriveTrashEntry[] {
    return this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_trash where purge_at <= $at order by purge_at, item_id limit $limit`,
      { at, limit },
    );
  }

  soonestPurge(): string | null {
    return (
      this.context.sql.get(SOONEST, 'select min(purge_at) as purge_at from drive_trash')
        ?.purge_at ?? null
    );
  }

  bytesByAdder(): DriveTrashBytes[] {
    return this.context.sql
      .all(
        ADDER_BYTES,
        `select added_by_profile_id, sum(bytes) as bytes from drive_trash group by added_by_profile_id`,
      )
      .map((row) => ({ addedByProfileId: row.added_by_profile_id, bytes: row.bytes }));
  }
}
