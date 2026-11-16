import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

export const DRIVE_MOUNT_COMMIT_STATES = ['open', 'done', 'aborted'] as const;

export type DriveMountCommitState = (typeof DRIVE_MOUNT_COMMIT_STATES)[number];

export type ByteRange = readonly [start: number, end: number];

export interface DriveMountCommit {
  readonly id: number;
  readonly placementId: string;
  readonly nodeId: string;
  readonly inodeId: number;
  readonly opKey: Uint8Array;
  readonly baseRev: number;
  readonly size: number | null;
  readonly ranges: readonly ByteRange[];
  readonly state: DriveMountCommitState;
  readonly resultRev: number | null;
  readonly createdAt: string;
}

export interface DriveMountCommitOpen {
  readonly placementId: string;
  readonly nodeId: string;
  readonly inodeId: number;
  readonly opKey: Uint8Array;
  readonly baseRev: number;
}

const RANGES = z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]));

const COMMIT_ROW = z
  .strictObject({
    id: z.number(),
    placement_id: z.string(),
    node_id: z.string(),
    inode_id: z.number(),
    op_key: z.instanceof(Uint8Array),
    base_rev: z.number(),
    size: z.number().nullable(),
    ranges: SQL_JSON.pipe(RANGES),
    state: z.enum(DRIVE_MOUNT_COMMIT_STATES),
    result_rev: z.number().nullable(),
    created_at: z.string(),
  })
  .transform((row): DriveMountCommit => ({
    id: row.id,
    placementId: row.placement_id,
    nodeId: row.node_id,
    inodeId: row.inode_id,
    opKey: row.op_key,
    baseRev: row.base_rev,
    size: row.size,
    ranges: row.ranges,
    state: row.state,
    resultRev: row.result_rev,
    createdAt: row.created_at,
  }));

const ID = z.strictObject({ id: z.number() });

const COUNT = z.strictObject({ count: z.number() });

const COLUMNS = `id, placement_id, node_id, inode_id, op_key, base_rev, size, ranges, state,
  result_rev, created_at`;

export function coversRanges(ranges: readonly ByteRange[], size: number): boolean {
  if (size === 0) return true;
  const [first] = ranges;
  return ranges.length === 1 && first?.[0] === 0 && first[1] >= size;
}

export function coveredBytes(ranges: readonly ByteRange[]): number {
  return ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
}

export class DriveMountCommitsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: number): DriveMountCommit | undefined {
    return this.context.sql.get(
      COMMIT_ROW,
      `select ${COLUMNS} from drive_mount_commits where id = $id`,
      { id },
    );
  }

  byId(id: number): DriveMountCommit {
    return found(this.find(id), 'drive mount commit', String(id));
  }

  ofPlacement(placementId: string, id: number): DriveMountCommit | undefined {
    return this.context.sql.get(
      COMMIT_ROW,
      `select ${COLUMNS} from drive_mount_commits where id = $id and placement_id = $placementId`,
      { id, placementId },
    );
  }

  begin(input: DriveMountCommitOpen): DriveMountCommit {
    return this.context.write(() => {
      const existing = this.context.sql.get(
        COMMIT_ROW,
        `select ${COLUMNS} from drive_mount_commits
          where placement_id = $placementId and op_key = $opKey`,
        { placementId: input.placementId, opKey: input.opKey },
      );
      if (existing !== undefined) return existing;
      const created = this.context.sql.get(
        ID,
        `insert into drive_mount_commits (placement_id, node_id, inode_id, op_key, base_rev, size,
            ranges, state, result_rev, created_at)
          values ($placementId, $nodeId, $inodeId, $opKey, $baseRev, null, '[]', 'open', null,
            $createdAt)
          returning id`,
        {
          placementId: input.placementId,
          nodeId: input.nodeId,
          inodeId: input.inodeId,
          opKey: input.opKey,
          baseRev: input.baseRev,
          createdAt: this.context.now(),
        },
      );
      return this.byId(found(created, 'drive mount commit', 'new').id);
    });
  }

  setRanges(id: number, ranges: readonly ByteRange[]): void {
    this.context.sql.run(
      'record the received ranges of the mount commit',
      `update drive_mount_commits set ranges = $ranges where id = $id and state = 'open'`,
      { id, ranges: jsonText(ranges) },
    );
  }

  finish(id: number, size: number, resultRev: number): DriveMountCommit {
    return this.context.write(() => {
      this.context.sql.run(
        'finish the mount commit',
        `update drive_mount_commits set state = 'done', size = $size, result_rev = $resultRev
          where id = $id and state = 'open'`,
        { id, size, resultRev },
      );
      return this.byId(id);
    });
  }

  abort(id: number): DriveMountCommit {
    return this.context.write(() => {
      this.context.sql.run(
        'abort the mount commit',
        `update drive_mount_commits set state = 'aborted' where id = $id and state = 'open'`,
        { id },
      );
      return this.byId(id);
    });
  }

  forget(placementId: string, ids: readonly number[]): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget the mount commits the journal dropped',
        `delete from drive_mount_commits
          where placement_id = $placementId and state <> 'open'
            and id in (select value from json_each($ids))`,
        { placementId, ids: jsonText(ids) },
      ),
    );
  }

  sweep(placementId: string, listed: readonly number[]): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget the finished mount commits the journal no longer lists',
        `delete from drive_mount_commits
          where placement_id = $placementId and state <> 'open'
            and id not in (select value from json_each($listed))`,
        { placementId, listed: jsonText(listed) },
      ),
    );
  }

  open(placementId: string): DriveMountCommit[] {
    return this.context.sql.all(
      COMMIT_ROW,
      `select ${COLUMNS} from drive_mount_commits
        where placement_id = $placementId and state = 'open' order by id`,
      { placementId },
    );
  }

  inFlight(placementId: string, inodeId: number): number {
    return (
      this.context.sql.get(
        COUNT,
        `select count(*) as count from drive_mount_commits
          where placement_id = $placementId and inode_id = $inodeId and state = 'open'`,
        { placementId, inodeId },
      )?.count ?? 0
    );
  }
}
