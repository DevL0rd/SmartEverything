import { z } from 'zod';
import { INTEGER, NANOSECONDS, FLAG, type ClientSql } from './sql.js';

export const LOCAL_HASH_STATES = ['hashed', 'stale', 'unhashed'] as const;

const FILE_ROW = z
  .object({
    root_id: z.string(),
    rel_path: z.string(),
    kind: z.enum(['file', 'folder']),
    bytes: INTEGER,
    mtime_ns: NANOSECONDS,
    mode: INTEGER,
    hub_rev: INTEGER.nullable(),
    local_hash_state: z.enum(LOCAL_HASH_STATES),
    block_size: INTEGER.nullable(),
    blocks: z.instanceof(Uint8Array).nullable(),
    pinned: FLAG,
  })
  .strict()
  .readonly();

export interface FileRecord {
  readonly rootId: string;
  readonly relPath: string;
  readonly kind: 'file' | 'folder';
  readonly bytes: number;
  readonly mtimeNs: bigint;
  readonly mode: number;
  readonly hubRev: number | null;
  readonly localHashState: (typeof LOCAL_HASH_STATES)[number];
  readonly blockSize: number | null;
  readonly blocks: Uint8Array | null;
  readonly pinned: boolean;
}

export type FileInput = Omit<FileRecord, 'pinned'>;

const COLUMNS =
  'root_id, rel_path, kind, bytes, mtime_ns, mode, hub_rev, local_hash_state, block_size, blocks, pinned';

const IN_SUBTREE = "(rel_path = ? or substr(rel_path, 1, length(?) + 1) = ? || '/')";

function record(row: z.infer<typeof FILE_ROW>): FileRecord {
  return {
    rootId: row.root_id,
    relPath: row.rel_path,
    kind: row.kind,
    bytes: row.bytes,
    mtimeNs: row.mtime_ns,
    mode: row.mode,
    hubRev: row.hub_rev,
    localHashState: row.local_hash_state,
    blockSize: row.block_size,
    blocks: row.blocks,
    pinned: row.pinned,
  };
}

export class FilesRepository {
  constructor(private readonly sql: ClientSql) {}

  upsert(file: FileInput): void {
    this.sql.run(
      `insert into files (${COLUMNS}) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        exists (select 1 from pins where root_id = ?1
          and (path = ?2 or substr(?2, 1, length(path) + 1) = path || '/')))
       on conflict (root_id, rel_path) do update set
         kind = excluded.kind, bytes = excluded.bytes, mtime_ns = excluded.mtime_ns,
         mode = excluded.mode, hub_rev = excluded.hub_rev,
         local_hash_state = excluded.local_hash_state,
         block_size = excluded.block_size, blocks = excluded.blocks`,
      [
        file.rootId,
        file.relPath,
        file.kind,
        file.bytes,
        file.mtimeNs,
        file.mode,
        file.hubRev,
        file.localHashState,
        file.blockSize,
        file.blocks,
      ],
    );
  }

  get(rootId: string, relPath: string): FileRecord | undefined {
    const row = this.sql.get(
      FILE_ROW,
      `select ${COLUMNS} from files where root_id = ? and rel_path = ?`,
      [rootId, relPath],
    );
    return row === undefined ? undefined : record(row);
  }

  list(rootId: string): readonly FileRecord[] {
    return this.sql
      .all(FILE_ROW, `select ${COLUMNS} from files where root_id = ? order by rel_path`, [rootId])
      .map(record);
  }

  listWhere(rootId: string, state: FileRecord['localHashState']): readonly FileRecord[] {
    return this.sql
      .all(
        FILE_ROW,
        `select ${COLUMNS} from files where root_id = ? and local_hash_state = ? order by rel_path`,
        [rootId, state],
      )
      .map(record);
  }

  setHubRev(rootId: string, relPath: string, hubRev: number): boolean {
    return (
      this.sql.run('update files set hub_rev = ? where root_id = ? and rel_path = ?', [
        hubRev,
        rootId,
        relPath,
      ]) === 1
    );
  }

  markStale(rootId: string, relPath: string): boolean {
    return (
      this.sql.run(
        `update files set local_hash_state = 'stale', blocks = null, block_size = null
         where root_id = ? and rel_path = ? and kind = 'file'`,
        [rootId, relPath],
      ) === 1
    );
  }

  remove(rootId: string, relPath: string): boolean {
    return (
      this.sql.run('delete from files where root_id = ? and rel_path = ?', [rootId, relPath]) === 1
    );
  }

  removeSubtree(rootId: string, relPath: string): number {
    return this.sql.run(`delete from files where root_id = ? and ${IN_SUBTREE}`, [
      rootId,
      relPath,
      relPath,
      relPath,
    ]);
  }

  rename(rootId: string, from: string, to: string): number {
    return this.sql.run(
      `update files set rel_path = ? || substr(rel_path, length(?) + 1)
       where root_id = ? and ${IN_SUBTREE}`,
      [to, from, rootId, from, from, from],
    );
  }

  clearRoot(rootId: string): void {
    this.sql.run('delete from files where root_id = ?', [rootId]);
  }
}
