import { DRIVE_VIA, type DriveVia } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const COLUMNS = `s.id, s.root_id, s.parent_item_id, s.target_item_id, s.name, s.created_by,
  s.created_at, s.created_via, exists (select 1 from drive_trash t where t.item_id = s.target_item_id) as trashed`;

const SHORTCUT_COLUMNS = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  parent_item_id: z.string().nullable(),
  target_item_id: z.string(),
  name: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  created_via: z.enum(DRIVE_VIA),
  trashed: z.boolean(),
});

export interface DriveShortcutRecord {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly targetItemId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly createdVia: DriveVia;
  readonly trashed: boolean;
}

const STORED_SHORTCUT = storedRow(
  SHORTCUT_COLUMNS.transform((row): DriveShortcutRecord => ({
    id: row.id,
    rootId: row.root_id,
    parentId: row.parent_item_id,
    targetItemId: row.target_item_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    createdVia: row.created_via,
    trashed: row.trashed,
  })),
  { flags: ['trashed'] },
);

const PRESENT = z.strictObject({ present: z.literal(1) });

export interface DriveShortcutInput {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly targetItemId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdVia: DriveVia;
}

export interface DriveShortcutChange {
  readonly rootId?: string;
  readonly parentId?: string | null;
  readonly name?: string;
}

export class DriveShortcutsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveShortcutRecord | undefined {
    return this.context.sql.get(
      STORED_SHORTCUT,
      `select ${COLUMNS} from drive_shortcuts s where s.id = $id`,
      { id },
    );
  }

  byId(id: string): DriveShortcutRecord {
    return found(this.find(id), 'drive shortcut', id);
  }

  inFolder(rootId: string, parentId: string | null): DriveShortcutRecord[] {
    return this.context.sql.all(
      STORED_SHORTCUT,
      `select ${COLUMNS} from drive_shortcuts s
        where s.root_id = $rootId and s.parent_item_id is $parentId order by s.name, s.id`,
      { rootId, parentId },
    );
  }

  pointingAt(targetItemId: string): DriveShortcutRecord[] {
    return this.context.sql.all(
      STORED_SHORTCUT,
      `select ${COLUMNS} from drive_shortcuts s where s.target_item_id = $targetItemId
        order by s.name, s.id`,
      { targetItemId },
    );
  }

  nameTaken(rootId: string, parentId: string | null, name: string): boolean {
    return (
      this.context.sql.get(
        PRESENT,
        `select 1 as present from drive_shortcuts
          where root_id = $rootId and parent_item_id is $parentId and name = $name`,
        { rootId, parentId, name },
      ) !== undefined
    );
  }

  create(input: DriveShortcutInput): DriveShortcutRecord {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'create the drive shortcut',
        `insert into drive_shortcuts (id, root_id, parent_item_id, target_item_id, name, created_by,
          created_at, created_via)
          values ($id, $rootId, $parentId, $targetItemId, $name, $createdBy, $now, $createdVia)`,
        {
          id,
          rootId: input.rootId,
          parentId: input.parentId,
          targetItemId: input.targetItemId,
          name: input.name,
          createdBy: input.createdBy,
          createdVia: input.createdVia,
          now: this.context.now(),
        },
      );
      return this.byId(id);
    });
  }

  update(id: string, change: DriveShortcutChange): DriveShortcutRecord {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'change the drive shortcut',
        `update drive_shortcuts set root_id = $rootId, parent_item_id = $parentId, name = $name
          where id = $id`,
        {
          id,
          rootId: change.rootId ?? before.rootId,
          parentId: change.parentId === undefined ? before.parentId : change.parentId,
          name: change.name ?? before.name,
        },
      );
      return this.byId(id);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'remove the drive shortcut',
        'delete from drive_shortcuts where id = $id',
        {
          id,
        },
      );
    });
  }

  sweepOrphans(): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the shortcuts whose target was deleted for good',
        `delete from drive_shortcuts
          where target_item_id not in (select id from drive_items)
            and target_item_id not in (select item_id from drive_trash)
            and target_item_id not in (
              select json_extract(row, '$.id') from drive_trash_rows where table_name = 'drive_items'
            )`,
      );
    });
  }
}
