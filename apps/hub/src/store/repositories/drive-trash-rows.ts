import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const IDENTIFIER = z.string().regex(/^[a-z_][a-z0-9_]*$/);

const DEPENDENT = z.object({ table_name: IDENTIFIER, column_name: IDENTIFIER });

const PRESENT = z.object({ table_name: IDENTIFIER });

const CURRENT_INODE = z.object({ inode_id: z.number() });

const SUBTREE_ID = z.object({ id: z.string() });

const COLUMN = z.object({ name: IDENTIFIER });

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

const INODE_FIELDS = [
  'id',
  'root_id',
  'is_root',
  'type',
  'mode',
  'uid',
  'gid',
  'rdev',
  'link_target',
  'atime_ns',
  'mtime_ns',
  'ctime_ns',
  'btime_ns',
  'orphan',
];

export interface StashedRoot {
  readonly kind: string;
  readonly inodeId: number | null;
  readonly linkTarget: string | null;
}

export interface StashLedger {
  readonly table: 'drive_trash_rows' | 'drive_missing_rows';
  readonly key: 'trash_item_id' | 'missing_item_id';
}

export const TRASH_LEDGER: StashLedger = { table: 'drive_trash_rows', key: 'trash_item_id' };

export const MISSING_LEDGER: StashLedger = { table: 'drive_missing_rows', key: 'missing_item_id' };

export interface StashedRow {
  readonly table: string;
  readonly values: Readonly<Record<string, SQLInputValue>>;
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

function matching(columns: readonly string[]): string {
  return columns.map((column) => `"${column}" in (select value from json_each($ids))`).join(' or ');
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

function ownRows(): readonly (readonly [string, string, string])[] {
  const named = `select i.inode_id from drive_items i join json_each($ids) j on j.value = i.id`;
  return [
    [
      INODES,
      `select ${INODE_COLUMNS} from drive_inodes n where n.id in (${named})`,
      'order by t.id',
    ],
    [
      XATTRS,
      `select x.* from drive_xattrs x where x.inode_id in (${named})`,
      'order by t.inode_id, t.name',
    ],
    [
      ITEMS,
      `select i.*, j.key as stash_order from drive_items i join json_each($ids) j on j.value = i.id`,
      'order by t.stash_order',
    ],
  ];
}

function fieldsOf(columns: readonly string[]): string {
  return columns
    .map(
      (column) =>
        `'${column}', case when typeof(t."${column}") = 'blob' then json_object('blob', lower(hex(t."${column}"))) else t."${column}" end`,
    )
    .join(', ');
}

export class DriveTrashRows {
  private dependents: Map<string, string[]> | null = null;
  private readonly columns = new Map<string, readonly string[]>();

  constructor(
    private readonly context: StoreContext,
    private readonly ledger: StashLedger,
  ) {}

  private dependentTables(): Map<string, string[]> {
    this.dependents ??= dependentTables(this.context);
    return this.dependents;
  }

  stash(itemId: string): void {
    const ids = jsonText(subtreeIds(this.context, itemId));
    let seq = 0;
    const keep = (
      table: string,
      select: string,
      columns: readonly string[],
      order: string,
    ): void => {
      seq += this.context.sql.run(
        'stash the rows of the trashed item',
        `insert into ${this.ledger.table} (${this.ledger.key}, seq, table_name, row)
         select $itemId, $seq + row_number() over (${order}) - 1, '${table}', json_object(${fieldsOf(columns)})
         from (${select}) t`,
        { itemId, seq, ids },
      );
    };
    for (const [table, select, order] of ownRows()) {
      keep(table, select, table === INODES ? INODE_FIELDS : this.columnsOf(table), order);
    }
    const present = this.present(ids);
    for (const [table, columns] of this.dependentTables()) {
      if (!present.has(table)) continue;
      keep(table, `select * from "${table}" where ${matching(columns)}`, this.columnsOf(table), '');
    }
  }

  private columnsOf(table: string): readonly string[] {
    let columns = this.columns.get(table);
    if (columns === undefined) {
      columns = this.context.sql
        .all(COLUMN, `select name from pragma_table_info('${table}') order by cid`)
        .map((row) => row.name);
      this.columns.set(table, columns);
    }
    return columns;
  }

  private present(ids: string): Set<string> {
    const probes = [...this.dependentTables()].map(
      ([table, columns]) =>
        `select '${table}' as table_name where exists (select 1 from "${table}" where ${matching(columns)})`,
    );
    if (probes.length === 0) return new Set();
    return new Set(
      this.context.sql
        .all(PRESENT, probes.join(' union all '), { ids })
        .map((row) => row.table_name),
    );
  }

  rows(itemId: string): StashedRow[] {
    return this.context.sql
      .all(
        STORED_ROW,
        `select table_name, row from ${this.ledger.table} where ${this.ledger.key} = $itemId order by seq`,
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

  restore(rows: readonly StashedRow[]): void {
    this.context.write(() => {
      for (const row of rows) this.insert(row, null);
    });
  }

  photoIds(itemId: string): string[] {
    return this.context.sql
      .all(
        z.object({ id: z.string() }),
        `select json_extract(row, '$.id') as id from ${this.ledger.table}
         where ${this.ledger.key} = $itemId and table_name = '${ITEMS}'`,
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
