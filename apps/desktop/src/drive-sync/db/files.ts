import { z } from 'zod';
import { INTEGER, NANOSECONDS, FLAG, type ClientSql } from './sql.js';

export const LOCAL_HASH_STATES = ['hashed', 'stale', 'unhashed'] as const;

const FILE_ROW = z
  .object({
    placement_id: z.string(),
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
  readonly placementId: string;
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
  'placement_id, rel_path, kind, bytes, mtime_ns, mode, hub_rev, local_hash_state, block_size, blocks, pinned';

const IN_SUBTREE = "(rel_path = ? or substr(rel_path, 1, length(?) + 1) = ? || '/')";

function record(row: z.infer<typeof FILE_ROW>): FileRecord {
  return {
    placementId: row.placement_id,
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
        exists (select 1 from pins where placement_id = ?1
          and (path = ?2 or substr(?2, 1, length(path) + 1) = path || '/')))
       on conflict (placement_id, rel_path) do update set
         kind = excluded.kind, bytes = excluded.bytes, mtime_ns = excluded.mtime_ns,
         mode = excluded.mode, hub_rev = excluded.hub_rev,
         local_hash_state = excluded.local_hash_state,
         block_size = excluded.block_size, blocks = excluded.blocks`,
      [
        file.placementId,
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

  get(placementId: string, relPath: string): FileRecord | undefined {
    const row = this.sql.get(
      FILE_ROW,
      `select ${COLUMNS} from files where placement_id = ? and rel_path = ?`,
      [placementId, relPath],
    );
    return row === undefined ? undefined : record(row);
  }

  list(placementId: string): readonly FileRecord[] {
    return this.sql
      .all(FILE_ROW, `select ${COLUMNS} from files where placement_id = ? order by rel_path`, [
        placementId,
      ])
      .map(record);
  }

  listWhere(placementId: string, state: FileRecord['localHashState']): readonly FileRecord[] {
    return this.sql
      .all(
        FILE_ROW,
        `select ${COLUMNS} from files where placement_id = ? and local_hash_state = ? order by rel_path`,
        [placementId, state],
      )
      .map(record);
  }

  setHubRev(placementId: string, relPath: string, hubRev: number): boolean {
    return (
      this.sql.run('update files set hub_rev = ? where placement_id = ? and rel_path = ?', [
        hubRev,
        placementId,
        relPath,
      ]) === 1
    );
  }

  markStale(placementId: string, relPath: string): boolean {
    return (
      this.sql.run(
        `update files set local_hash_state = 'stale', blocks = null, block_size = null
         where placement_id = ? and rel_path = ? and kind = 'file'`,
        [placementId, relPath],
      ) === 1
    );
  }

  remove(placementId: string, relPath: string): boolean {
    return (
      this.sql.run('delete from files where placement_id = ? and rel_path = ?', [
        placementId,
        relPath,
      ]) === 1
    );
  }

  removeSubtree(placementId: string, relPath: string): number {
    return this.sql.run(`delete from files where placement_id = ? and ${IN_SUBTREE}`, [
      placementId,
      relPath,
      relPath,
      relPath,
    ]);
  }

  rename(placementId: string, from: string, to: string): number {
    return this.sql.run(
      `update files set rel_path = ? || substr(rel_path, length(?) + 1)
       where placement_id = ? and ${IN_SUBTREE}`,
      [to, from, placementId, from, from, from],
    );
  }

  clearRoot(placementId: string): void {
    this.sql.run('delete from files where placement_id = ?', [placementId]);
  }
}
