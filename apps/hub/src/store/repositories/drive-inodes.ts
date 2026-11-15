import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { flag } from '../sql';

export const DRIVE_INODE_TYPES = [
  'file',
  'dir',
  'symlink',
  'fifo',
  'socket',
  'char',
  'block',
] as const;

export type DriveInodeType = (typeof DRIVE_INODE_TYPES)[number];

export const FOLDER_MODE = 0o755;

export const FILE_MODE = 0o644;

const NS_PER_MS = 1_000_000n;

export function nsOfMoment(moment: string): bigint {
  return BigInt(Date.parse(moment)) * NS_PER_MS;
}

export function momentOfNs(ns: bigint): string {
  return new Date(Number(ns / NS_PER_MS)).toISOString();
}

export interface DriveInode {
  readonly id: number;
  readonly rootId: string;
  readonly isRoot: boolean;
  readonly type: DriveInodeType;
  readonly mode: number;
  readonly uid: number | null;
  readonly gid: number | null;
  readonly rdev: number | null;
  readonly linkTarget: string | null;
  readonly atimeNs: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly btimeNs: bigint;
  readonly orphan: boolean;
}

export interface DriveInodeDraft {
  readonly rootId: string;
  readonly type: DriveInodeType;
  readonly mode?: number | undefined;
  readonly uid?: number | null | undefined;
  readonly gid?: number | null | undefined;
  readonly rdev?: number | null | undefined;
  readonly linkTarget?: string | null | undefined;
  readonly atimeNs?: bigint | undefined;
  readonly mtimeNs?: bigint | undefined;
  readonly ctimeNs?: bigint | undefined;
  readonly btimeNs?: bigint | undefined;
}

export interface DriveInodeTimes {
  readonly atimeNs?: bigint | undefined;
  readonly mtimeNs?: bigint | undefined;
  readonly ctimeNs?: bigint | undefined;
}

export interface DriveDiskStat {
  readonly mtimeNs: bigint;
  readonly bytes: number | null;
}

export interface DriveInodeAttributes {
  readonly mode?: number | undefined;
  readonly uid?: number | null | undefined;
  readonly gid?: number | null | undefined;
}

const NS = z.string().regex(/^\d+$/).transform(BigInt);

const INODE_ROW = z.strictObject({
  id: z.number(),
  root_id: z.string(),
  is_root: z.number(),
  type: z.enum(DRIVE_INODE_TYPES),
  mode: z.number(),
  uid: z.number().nullable(),
  gid: z.number().nullable(),
  rdev: z.number().nullable(),
  link_target: z.string().nullable(),
  atime_ns: NS,
  mtime_ns: NS,
  ctime_ns: NS,
  btime_ns: NS,
  orphan: z.number(),
});

function inodeOf(row: z.output<typeof INODE_ROW>): DriveInode {
  return {
    id: row.id,
    rootId: row.root_id,
    isRoot: row.is_root === 1,
    type: row.type,
    mode: row.mode,
    uid: row.uid,
    gid: row.gid,
    rdev: row.rdev,
    linkTarget: row.link_target,
    atimeNs: row.atime_ns,
    mtimeNs: row.mtime_ns,
    ctimeNs: row.ctime_ns,
    btimeNs: row.btime_ns,
    orphan: row.orphan === 1,
  };
}

const STORED_INODE = INODE_ROW.transform(inodeOf);

const COLUMNS = `id, root_id, is_root, type, mode, uid, gid, rdev, link_target,
  cast(atime_ns as text) as atime_ns, cast(mtime_ns as text) as mtime_ns,
  cast(ctime_ns as text) as ctime_ns, cast(btime_ns as text) as btime_ns, orphan`;

const COUNT = z.strictObject({ id: z.number(), links: z.number() });

const ID = z.strictObject({ id: z.number() });

const NAME = z.strictObject({ id: z.string() });

const LINKS = `case when n.type = 'dir' then 2 + (
    select count(*) from drive_items c
    where c.kind = 'folder' and c.root_id = n.root_id
      and ((n.is_root = 1 and c.parent_id is null)
        or (n.is_root = 0 and c.parent_id = (select i.id from drive_items i where i.inode_id = n.id)))
  ) else (select count(*) from drive_items i where i.inode_id = n.id) end`;

export function defaultModeOf(type: DriveInodeType): number {
  return type === 'dir' ? FOLDER_MODE : FILE_MODE;
}

export function writeInodeTimes(
  context: StoreContext,
  inodeId: number,
  times: DriveInodeTimes,
): void {
  context.write(() => {
    const parameters = {
      id: inodeId,
      atime: times.atimeNs ?? null,
      mtime: times.mtimeNs ?? null,
      ctime: times.ctimeNs ?? null,
    };
    context.sql.run(
      'write the times of the drive inode',
      `update drive_inodes set atime_ns = coalesce($atime, atime_ns),
        mtime_ns = coalesce($mtime, mtime_ns), ctime_ns = coalesce($ctime, ctime_ns)
        where id = $id`,
      parameters,
    );
    if (times.mtimeNs !== undefined) {
      context.sql.run(
        'mirror the modified time on the names of the drive inode',
        'update drive_items set modified_at = $moment where inode_id = $id',
        { id: inodeId, moment: momentOfNs(times.mtimeNs) },
      );
    }
  });
}

export class DriveInodesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: number): DriveInode | undefined {
    return this.context.sql.get(
      STORED_INODE,
      `select ${COLUMNS} from drive_inodes where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: number): DriveInode {
    return found(this.find(id), 'drive inode', String(id));
  }

  findMany(ids: readonly number[]): DriveInode[] {
    return this.context.sql.all(
      STORED_INODE,
      `select ${COLUMNS} from drive_inodes where id in (select value from json_each($ids)) order by id`,
      { ids: JSON.stringify(ids) },
    );
  }

  rootOf(rootId: string): DriveInode {
    return found(
      this.context.sql.get(
        STORED_INODE,
        `select ${COLUMNS} from drive_inodes where root_id = $rootId and is_root = 1`,
        { rootId },
      ),
      'drive root inode',
      rootId,
    );
  }

  ofItem(itemId: string): DriveInode | undefined {
    return this.context.sql.get(
      STORED_INODE,
      `select ${COLUMNS} from drive_inodes
        where id = (select inode_id from drive_items where id = $itemId)`,
      { itemId },
    );
  }

  create(draft: DriveInodeDraft): DriveInode {
    return this.context.write(() => {
      const now = nsOfMoment(this.context.now());
      const mtime = draft.mtimeNs ?? now;
      const id = this.context.sql.get(
        ID,
        `insert into drive_inodes (root_id, is_root, type, mode, uid, gid, rdev, link_target,
            atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
          values ($rootId, 0, $type, $mode, $uid, $gid, $rdev, $linkTarget,
            $atime, $mtime, $ctime, $btime, 0)
          returning id`,
        {
          rootId: draft.rootId,
          type: draft.type,
          mode: draft.mode ?? defaultModeOf(draft.type),
          uid: draft.uid ?? null,
          gid: draft.gid ?? null,
          rdev: draft.rdev ?? null,
          linkTarget: draft.linkTarget ?? null,
          atime: draft.atimeNs ?? mtime,
          mtime,
          ctime: draft.ctimeNs ?? mtime,
          btime: draft.btimeNs ?? now,
        },
      );
      return this.byId(found(id, 'drive inode', 'new').id);
    });
  }

  setAttributes(id: number, attributes: DriveInodeAttributes): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'write the attributes of the drive inode',
        `update drive_inodes set mode = coalesce($mode, mode),
          uid = case when $setUid = 1 then $uid else uid end,
          gid = case when $setGid = 1 then $gid else gid end
          where id = $id`,
        {
          id,
          mode: attributes.mode ?? null,
          setUid: flag(attributes.uid !== undefined),
          uid: attributes.uid ?? null,
          setGid: flag(attributes.gid !== undefined),
          gid: attributes.gid ?? null,
        },
      );
    });
  }

  setTimes(id: number, times: DriveInodeTimes): void {
    this.context.write(() => {
      this.byId(id);
      writeInodeTimes(this.context, id, times);
    });
  }

  setTimesOnDisk(id: number, times: DriveInodeTimes, disk: DriveDiskStat): void {
    this.context.write(() => {
      this.byId(id);
      writeInodeTimes(this.context, id, times);
      this.context.sql.run(
        'match the names of the drive inode to the stat on disk',
        `update drive_items set modified_at = $moment,
          bytes = case when $setBytes = 1 then $bytes else bytes end
          where inode_id = $id`,
        {
          id,
          moment: momentOfNs(disk.mtimeNs),
          setBytes: flag(disk.bytes !== null),
          bytes: disk.bytes,
        },
      );
    });
  }

  replaceLink(id: number, linkTarget: string): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'replace the target of the drive symlink',
        `update drive_inodes set link_target = $linkTarget where id = $id and type = 'symlink'`,
        { id, linkTarget },
      );
    });
  }

  setOrphan(id: number, orphan: boolean): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'mark the drive inode as held without a name',
        'update drive_inodes set orphan = $orphan where id = $id and is_root = 0',
        { id, orphan: flag(orphan) },
      );
    });
  }

  remove(id: number): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'remove the drive inode',
        'delete from drive_inodes where id = $id and is_root = 0',
        { id },
      );
    });
  }

  orphans(rootId: string | null): DriveInode[] {
    return this.context.sql.all(
      STORED_INODE,
      `select ${COLUMNS} from drive_inodes
        where orphan = 1 and ($rootId is null or root_id = $rootId) order by id`,
      { rootId },
    );
  }

  unnamed(rootId: string): DriveInode[] {
    return this.context.sql.all(
      STORED_INODE,
      `select ${COLUMNS} from drive_inodes n
        where root_id = $rootId and is_root = 0 and orphan = 0
          and not exists (select 1 from drive_items i where i.inode_id = n.id) order by id`,
      { rootId },
    );
  }

  names(id: number): string[] {
    return this.context.sql
      .all(NAME, 'select id from drive_items where inode_id = $id order by id', { id })
      .map((row) => row.id);
  }

  linkCount(id: number): number {
    return this.linkCounts([id]).get(id) ?? 0;
  }

  linkCounts(ids: readonly number[]): Map<number, number> {
    return new Map(
      this.context.sql
        .all(
          COUNT,
          `select n.id, ${LINKS} as links from drive_inodes n
            where n.id in (select value from json_each($ids))`,
          { ids: JSON.stringify(ids) },
        )
        .map((row) => [row.id, row.links]),
    );
  }

  inodeCount(rootId: string): number {
    return (
      this.context.sql.get(
        z.strictObject({ count: z.number() }),
        'select count(*) as count from drive_inodes where root_id = $rootId',
        { rootId },
      )?.count ?? 0
    );
  }
}
