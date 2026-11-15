import { SYNC_XATTRS, type SyncXattr } from '@smarteverything/domain/drive-sync';
import { z } from 'zod';
import { INTEGER, NANOSECONDS, FLAG, type ClientSql } from './sql.js';

export const LOCAL_HASH_STATES = ['hashed', 'stale', 'unhashed'] as const;

const FILE_ROW = z
  .object({
    placement_id: z.string(),
    rel_path: z.string(),
    kind: z.enum(['file', 'folder', 'link']),
    bytes: INTEGER,
    mtime_ns: NANOSECONDS,
    mode: INTEGER,
    hub_rev: INTEGER.nullable(),
    local_hash_state: z.enum(LOCAL_HASH_STATES),
    block_size: INTEGER.nullable(),
    blocks: z.instanceof(Uint8Array).nullable(),
    pinned: FLAG,
    link_target: z.string().nullable(),
    link_key: z.string().nullable(),
    hub_inode: INTEGER.nullable(),
    xattrs: z.string().transform((text): unknown => JSON.parse(text)),
    meta_dirty: FLAG,
  })
  .strict()
  .readonly();

export interface FileRecord {
  readonly placementId: string;
  readonly relPath: string;
  readonly kind: 'file' | 'folder' | 'link';
  readonly bytes: number;
  readonly mtimeNs: bigint;
  readonly mode: number;
  readonly hubRev: number | null;
  readonly localHashState: (typeof LOCAL_HASH_STATES)[number];
  readonly blockSize: number | null;
  readonly blocks: Uint8Array | null;
  readonly pinned: boolean;
  readonly linkTarget: string | null;
  readonly linkKey: string | null;
  readonly hubInode: number | null;
  readonly xattrs: readonly SyncXattr[];
  readonly metaDirty: boolean;
}

export type FileInput = Omit<FileRecord, 'pinned'>;

export function inputOf(record: FileRecord, changes: Partial<FileInput> = {}): FileInput {
  const { pinned: _pinned, ...input } = record;
  return { ...input, ...changes };
}

const COLUMNS =
  'placement_id, rel_path, kind, bytes, mtime_ns, mode, hub_rev, local_hash_state, block_size, blocks, pinned, link_target, link_key, hub_inode, xattrs, meta_dirty';

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
    linkTarget: row.link_target,
    linkKey: row.link_key,
    hubInode: row.hub_inode,
    xattrs: SYNC_XATTRS.parse(row.xattrs),
    metaDirty: row.meta_dirty,
  };
}

export class FilesRepository {
  constructor(private readonly sql: ClientSql) {}

  upsert(file: FileInput): void {
    this.sql.run(
      `insert into files (${COLUMNS}) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        exists (select 1 from pins where placement_id = ?1
          and (path = ?2 or substr(?2, 1, length(path) + 1) = path || '/')),
        ?11, ?12, ?13, ?14, ?15)
       on conflict (placement_id, rel_path) do update set
         kind = excluded.kind, bytes = excluded.bytes, mtime_ns = excluded.mtime_ns,
         mode = excluded.mode, hub_rev = excluded.hub_rev,
         local_hash_state = excluded.local_hash_state,
         block_size = excluded.block_size, blocks = excluded.blocks,
         link_target = excluded.link_target, link_key = excluded.link_key,
         hub_inode = excluded.hub_inode, xattrs = excluded.xattrs,
         meta_dirty = excluded.meta_dirty`,
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
        file.linkTarget,
        file.linkKey,
        file.hubInode,
        JSON.stringify(file.xattrs),
        file.metaDirty ? 1 : 0,
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

  byHubInode(placementId: string, hubInode: number): readonly FileRecord[] {
    return this.sql
      .all(
        FILE_ROW,
        `select ${COLUMNS} from files where placement_id = ? and hub_inode = ? order by rel_path`,
        [placementId, hubInode],
      )
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

  setHubInode(placementId: string, relPath: string, hubInode: number | null): boolean {
    return (
      this.sql.run('update files set hub_inode = ? where placement_id = ? and rel_path = ?', [
        hubInode,
        placementId,
        relPath,
      ]) === 1
    );
  }

  setMetaDirty(placementId: string, relPath: string, dirty: boolean): boolean {
    return (
      this.sql.run('update files set meta_dirty = ? where placement_id = ? and rel_path = ?', [
        dirty ? 1 : 0,
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
