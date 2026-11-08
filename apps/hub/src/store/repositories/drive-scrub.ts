import { z } from 'zod';
import type { StoreContext } from '../context';

export const DRIVE_SCRUB_RESULTS = ['ok', 'corrupt'] as const;

export type DriveScrubResult = (typeof DRIVE_SCRUB_RESULTS)[number];

const RESULT_COLUMNS = z
  .strictObject({
    item_id: z.string(),
    root_id: z.string(),
    verified_at: z.string(),
    result: z.enum(DRIVE_SCRUB_RESULTS),
  })
  .transform((row): DriveScrubRecord => ({
    itemId: row.item_id,
    rootId: row.root_id,
    verifiedAt: row.verified_at,
    result: row.result,
  }));

const PENDING_COLUMNS = z
  .strictObject({
    id: z.string(),
    rel_path: z.string(),
    sha256: z.string(),
    bytes: z.number(),
    modified_at: z.string(),
  })
  .transform((row): DriveScrubCandidate => ({
    itemId: row.id,
    relPath: row.rel_path,
    sha256: row.sha256,
    bytes: row.bytes,
    modifiedAt: row.modified_at,
  }));

const COUNT = z.strictObject({ count: z.number() }).transform((row) => row.count);

export interface DriveScrubRecord {
  readonly itemId: string;
  readonly rootId: string;
  readonly verifiedAt: string;
  readonly result: DriveScrubResult;
}

export interface DriveScrubCandidate {
  readonly itemId: string;
  readonly relPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly modifiedAt: string;
}

export interface DriveScrubProgress {
  readonly total: number;
  readonly checked: number;
  readonly corrupt: number;
}

export class DriveScrubRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): DriveScrubRecord | undefined {
    return this.context.sql.get(
      RESULT_COLUMNS,
      'select item_id, root_id, verified_at, result from drive_scrub where item_id = $itemId',
      { itemId },
    );
  }

  record(rootId: string, itemId: string, result: DriveScrubResult): DriveScrubRecord {
    return this.context.write(() => {
      const at = this.context.now();
      this.context.sql.run(
        'record the scrub result',
        `insert into drive_scrub (item_id, root_id, verified_at, result)
          values ($itemId, $rootId, $at, $result)
          on conflict (item_id) do update set root_id = excluded.root_id,
            verified_at = excluded.verified_at, result = excluded.result`,
        { itemId, rootId, at, result },
      );
      return { itemId, rootId, verifiedAt: at, result };
    });
  }

  next(
    rootId: string,
    startedAt: string,
    after: string | null,
    limit: number,
  ): DriveScrubCandidate[] {
    return this.context.sql.all(
      PENDING_COLUMNS,
      `select i.id, i.rel_path, i.sha256, i.bytes, i.modified_at
        from drive_items i
        left join drive_scrub s on s.item_id = i.id
        where i.root_id = $rootId and i.kind <> 'folder' and i.sha256 is not null
          and (s.verified_at is null or s.verified_at < $startedAt)
          and ($after is null or i.id > $after)
        order by i.id limit $limit`,
      { rootId, startedAt, after, limit },
    );
  }

  progress(rootId: string, startedAt: string): DriveScrubProgress {
    const total = this.count(
      "select count(*) as count from drive_items where root_id = $rootId and kind <> 'folder' and sha256 is not null",
      { rootId },
    );
    const checked = this.count(
      `select count(*) as count from drive_scrub s join drive_items i on i.id = s.item_id
        where s.root_id = $rootId and s.verified_at >= $startedAt
          and i.kind <> 'folder' and i.sha256 is not null`,
      { rootId, startedAt },
    );
    return { total, checked, corrupt: this.corrupt(rootId) };
  }

  corrupt(rootId: string): number {
    return this.count(
      "select count(*) as count from drive_scrub where root_id = $rootId and result = 'corrupt'",
      { rootId },
    );
  }

  verified(rootId: string): number {
    return this.count(
      `select count(*) as count from drive_scrub s join drive_items i on i.id = s.item_id
        where s.root_id = $rootId and s.result = 'ok' and i.sha256 is not null`,
      { rootId },
    );
  }

  lastVerifiedAt(rootId: string): string | null {
    return (
      this.context.sql.get(
        z.strictObject({ at: z.string().nullable() }).transform((row) => row.at),
        'select max(verified_at) as at from drive_scrub where root_id = $rootId',
        { rootId },
      ) ?? null
    );
  }

  private count(text: string, parameters: Readonly<Record<string, string>>): number {
    return this.context.sql.get(COUNT, text, parameters) ?? 0;
  }
}
