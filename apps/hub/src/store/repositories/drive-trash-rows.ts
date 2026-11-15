import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const IDENTIFIER = z.string().regex(/^[a-z_][a-z0-9_]*$/);

const DEPENDENT = z.object({ table_name: IDENTIFIER, column_name: IDENTIFIER });

const CURRENT_INODE = z.object({ inode_id: z.number() });

const SUBTREE_ID = z.object({ id: z.string() });

const COLUMN_VALUE = z.union([z.null(), z.number(), z.string(), z.instanceof(Uint8Array)]);

const READ_ROW = z.record(z.string(), COLUMN_VALUE);

const STORED_VALUE = z.union([
  z.null(),
  z.number(),
  z.string(),
  z.strictObject({ blob: z.string() }),
]);

const STORED_ROW = z.object({
  table_name: IDENTIFIER,
  row: SQL_JSON.pipe(z.record(IDENTIFIER, STORED_VALUE)),
});

const ITEMS = 'drive_items';

const INODES = 'drive_inodes';

const XATTRS = 'drive_xattrs';

const INODE_FIRST = [INODES, XATTRS];

const INODE_COLUMNS = `n.id, n.root_id, n.is_root, n.type, n.mode, n.uid, n.gid, n.rdev, n.link_target,
  cast(n.atime_ns as text) as atime_ns, cast(n.mtime_ns as text) as mtime_ns,
  cast(n.ctime_ns as text) as ctime_ns, cast(n.btime_ns as text) as btime_ns, 0 as orphan`;

export interface StashedRoot {
  readonly kind: string;
  readonly inodeId: number | null;
  readonly linkTarget: string | null;
}

export interface StashedRow {
  readonly table: string;
  readonly values: Readonly<Record<string, SQLInputValue>>;
}

function stored(value: z.output<typeof COLUMN_VALUE>): z.output<typeof STORED_VALUE> {
  return value instanceof Uint8Array ? { blob: Buffer.from(value).toString('hex') } : value;
}

function revived(value: z.output<typeof STORED_VALUE>): SQLInputValue {
  return value !== null && typeof value === 'object' ? Buffer.from(value.blob, 'hex') : value;
}

function dependentTables(context: StoreContext): Map<string, string[]> {
  const rows = context.sql.all(
    DEPENDENT,
    `select m.name as table_name, f."from" as column_name
     from sqlite_master m, pragma_foreign_key_list(m.name) f
     where m.type = 'table' and m.name <> '${ITEMS}'
       and f."table" = '${ITEMS}' and f.on_delete = 'CASCADE'`,
  );
  const tables = new Map<string, string[]>();
  for (const row of rows) {
    const columns = tables.get(row.table_name);
    if (columns === undefined) tables.set(row.table_name, [row.column_name]);
    else columns.push(row.column_name);
  }
  return tables;
}

function subtreeIds(context: StoreContext, itemId: string): string[] {
  return context.sql
    .all(
      SUBTREE_ID,
      `with recursive subtree (id, depth) as (
         select id, 0 from drive_items where id = $itemId
         union all
         select child.id, parent.depth + 1 from drive_items child
           join subtree parent on child.parent_id = parent.id
       ) select id from subtree order by depth, id`,
      { itemId },
    )
    .map((row) => row.id);
}

function ownRows(): readonly (readonly [string, string])[] {
  const named = `select i.inode_id from drive_items i join json_each($ids) j on j.value = i.id`;
  return [
    [INODES, `select ${INODE_COLUMNS} from drive_inodes n where n.id in (${named}) order by n.id`],
    [
      XATTRS,
      `select x.* from drive_xattrs x where x.inode_id in (${named}) order by x.inode_id, x.name`,
    ],
    [
      ITEMS,
      `select i.* from drive_items i join json_each($ids) j on j.value = i.id order by j.key`,
    ],
  ];
}

export class DriveTrashRows {
  constructor(private readonly context: StoreContext) {}

  stash(itemId: string): void {
    const ids = jsonText(subtreeIds(this.context, itemId));
    const dependents = dependentTables(this.context);
    let seq = 0;
    const keep = (table: string, rows: readonly z.output<typeof READ_ROW>[]): void => {
      for (const row of rows) {
        this.context.sql.run(
          'stash a row of the trashed item',
          `insert into drive_trash_rows (trash_item_id, seq, table_name, row)
           values ($itemId, $seq, $table, $row)`,
          {
            itemId,
            seq,
            table,
            row: jsonText(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, stored(v)]))),
          },
        );
        seq += 1;
      }
    };
    for (const [table, text] of ownRows()) {
      keep(table, this.context.sql.all(READ_ROW, text, { ids }));
    }
    for (const [table, columns] of dependents) {
      const matches = columns
        .map((column) => `"${column}" in (select value from json_each($ids))`)
        .join(' or ');
      keep(
        table,
        this.context.sql.all(READ_ROW, `select * from "${table}" where ${matches}`, { ids }),
      );
    }
  }

  rows(itemId: string): StashedRow[] {
    return this.context.sql
      .all(
        STORED_ROW,
        'select table_name, row from drive_trash_rows where trash_item_id = $itemId order by seq',
        { itemId },
      )
      .map((row) => ({
        table: row.table_name,
        values: Object.fromEntries(Object.entries(row.row).map(([k, v]) => [k, revived(v)])),
      }));
  }

  root(itemId: string): StashedRoot {
    const rows = this.rows(itemId);
    const root = rows.find((row) => row.table === ITEMS && row.values['id'] === itemId);
    const kind = root?.values['kind'];
    if (typeof kind !== 'string') {
      throw new Error(`The trashed item ${itemId} has no stashed row.`);
    }
    const inodeId = root?.values['inode_id'];
    const inode = rows.find((row) => row.table === INODES && row.values['id'] === inodeId);
    const target = inode?.values['link_target'];
    return {
      kind,
      inodeId: typeof inodeId === 'number' ? inodeId : null,
      linkTarget: typeof target === 'string' ? target : null,
    };
  }

  thumbRev(itemId: string): number | null {
    const root = this.rows(itemId).find(
      (row) => row.table === ITEMS && row.values['id'] === itemId,
    );
    const rev = root?.values['rev'];
    return root?.values['thumb_state'] === 'ready' && typeof rev === 'number' ? rev : null;
  }

  reinstateInodes(rows: readonly StashedRow[]): void {
    this.context.write(() => {
      for (const row of rows.filter((one) => INODE_FIRST.includes(one.table))) {
        this.insert(row, null);
      }
    });
  }

  reinstate(itemId: string, rows: readonly StashedRow[], to: string): void {
    const root = rows.find((row) => row.table === ITEMS && row.values['id'] === itemId);
    const from = typeof root?.values['rel_path'] === 'string' ? root.values['rel_path'] : null;
    const ordered = [
      ...rows.filter((row) => INODE_FIRST.includes(row.table)),
      ...rows.filter((row) => !INODE_FIRST.includes(row.table)),
    ];
    const rewritten = root?.values['inode_id'];
    const shared = rows.some(
      (row) =>
        row.table === ITEMS && row.values['id'] !== itemId && row.values['inode_id'] === rewritten,
    );
    const current = this.context.sql.get(
      CURRENT_INODE,
      'select inode_id from drive_items where id = $itemId',
      { itemId },
    )?.inode_id;
    const stale = (row: StashedRow): boolean =>
      !shared &&
      current !== rewritten &&
      ((row.table === INODES && row.values['id'] === rewritten) ||
        (row.table === XATTRS && row.values['inode_id'] === rewritten));
    this.context.write(() => {
      for (const row of ordered) {
        if (row.table === ITEMS && row.values['id'] === itemId) continue;
        if (stale(row)) continue;
        this.insert(row, from === null ? null : { from, to });
      }
    });
  }

  photoIds(itemId: string): string[] {
    return this.context.sql
      .all(
        z.object({ id: z.string() }),
        `select json_extract(row, '$.id') as id from drive_trash_rows
         where trash_item_id = $itemId and table_name = '${ITEMS}'`,
        { itemId },
      )
      .map((row) => row.id);
  }

  private insert(row: StashedRow, move: { from: string; to: string } | null): void {
    const values =
      row.table === ITEMS && move !== null ? { ...row.values, ...rebased(row, move) } : row.values;
    const columns = Object.keys(values);
    this.context.sql.run(
      'reinstate a row of the restored item',
      `insert ${row.table === ITEMS ? '' : 'or ignore '}into "${row.table}"
         (${columns.map((column) => `"${column}"`).join(', ')})
         values (${columns.map((_, index) => `$c${String(index)}`).join(', ')})`,
      Object.fromEntries(
        columns.map((column, index) => [`c${String(index)}`, values[column] ?? null]),
      ),
    );
  }
}

function rebased(row: StashedRow, move: { from: string; to: string }): Record<string, string> {
  const path = row.values['rel_path'];
  if (typeof path !== 'string' || !path.startsWith(`${move.from}/`)) return {};
  return { rel_path: `${move.to}${path.slice(move.from.length)}` };
}
