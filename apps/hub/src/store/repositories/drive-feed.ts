import {
  DRIVE_FEED_ROW,
  type DriveFeedOp,
  type DriveFeedRow,
  type DriveVia,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS = 'seq, root_id, item_id, op, rev, at, actor_profile_id, via, device_id';

const FEED_COLUMNS = z.strictObject({
  seq: z.number(),
  root_id: z.string(),
  item_id: z.string(),
  op: z.string(),
  rev: z.number(),
  at: z.string(),
  actor_profile_id: z.string().nullable(),
  via: z.string(),
  device_id: z.string().nullable(),
});

function rowOf(row: z.output<typeof FEED_COLUMNS>): DriveFeedRow {
  return DRIVE_FEED_ROW.parse({
    seq: row.seq,
    rootId: row.root_id,
    itemId: row.item_id,
    op: row.op,
    rev: row.rev,
    at: row.at,
    actorProfileId: row.actor_profile_id,
    via: row.via,
    deviceId: row.device_id,
  });
}

const STORED_ROW = storedRow(FEED_COLUMNS.transform(rowOf), {});

const SEQ = z.object({ seq: z.number().nullable() });

export interface DriveFeedAppend {
  readonly rootId: string;
  readonly itemId: string;
  readonly op: DriveFeedOp;
  readonly rev: number;
  readonly actorProfileId: string | null;
  readonly via: DriveVia;
  readonly deviceId: string | null;
}

export interface DriveFeedWindow {
  readonly rows: readonly DriveFeedRow[];
  readonly next: number | null;
}

function windowOf(rows: DriveFeedRow[], limit: number): DriveFeedWindow {
  const last = rows.at(-1);
  return { rows, next: rows.length === limit && last !== undefined ? last.seq : null };
}

export interface DriveActivityWindowRequest {
  readonly rootIds: readonly string[];
  readonly from: string;
  readonly before: number | null;
  readonly limit: number;
}

export class DriveFeedRepository {
  constructor(private readonly context: StoreContext) {}

  append(entry: DriveFeedAppend): DriveFeedRow {
    return this.context.write(() => {
      this.context.sql.run(
        'append to the drive feed',
        `insert into drive_feed (root_id, item_id, op, rev, at, actor_profile_id, via, device_id)
          values ($rootId, $itemId, $op, $rev, $at, $actorProfileId, $via, $deviceId)`,
        { ...entry, at: this.context.now() },
      );
      return this.rowAt(this.latestSeq());
    });
  }

  latestSeq(): number {
    return this.context.sql.get(SEQ, 'select max(seq) as seq from drive_feed')?.seq ?? 0;
  }

  latestSeqInRoot(rootId: string): number {
    return (
      this.context.sql.get(SEQ, 'select max(seq) as seq from drive_feed where root_id = $rootId', {
        rootId,
      })?.seq ?? 0
    );
  }

  since(after: number, limit: number): DriveFeedWindow {
    return windowOf(
      this.context.sql.all(
        STORED_ROW,
        `select ${COLUMNS} from drive_feed where seq > $after order by seq limit $limit`,
        { after, limit },
      ),
      limit,
    );
  }

  sinceInRoot(rootId: string, after: number, limit: number): DriveFeedWindow {
    return windowOf(
      this.context.sql.all(
        STORED_ROW,
        `select ${COLUMNS} from drive_feed
          where root_id = $rootId and seq > $after order by seq limit $limit`,
        { rootId, after, limit },
      ),
      limit,
    );
  }

  ofItem(itemId: string, after: number, limit: number): DriveFeedWindow {
    return windowOf(
      this.context.sql.all(
        STORED_ROW,
        `select ${COLUMNS} from drive_feed
          where item_id = $itemId and seq > $after order by seq limit $limit`,
        { itemId, after, limit },
      ),
      limit,
    );
  }

  recentOfItem(itemId: string, before: number | null, limit: number): DriveFeedWindow {
    return windowOf(
      this.context.sql.all(
        STORED_ROW,
        `select ${COLUMNS} from drive_feed
          where item_id = $itemId ${before === null ? '' : 'and seq < $before'}
          order by seq desc limit $limit`,
        before === null ? { itemId, limit } : { itemId, before, limit },
      ),
      limit,
    );
  }

  latest(ops: readonly DriveFeedOp[], before: number | null, limit: number): DriveFeedWindow {
    const filter = inList('op', 'ops', ops);
    const rows = this.context.sql.all(
      STORED_ROW,
      `select ${COLUMNS} from drive_feed
        where ${filter.text} ${before === null ? '' : 'and seq < $before'}
        order by seq desc limit $limit`,
      before === null ? { ...filter.parameters, limit } : { ...filter.parameters, before, limit },
    );
    return windowOf(rows, limit);
  }

  recentActivity(request: DriveActivityWindowRequest): DriveFeedWindow {
    const roots = inList('root_id', 'rootIds', request.rootIds);
    const rows = this.context.sql.all(
      STORED_ROW,
      `select ${COLUMNS} from drive_feed
        where ${roots.text} and julianday(at) >= julianday($from)
          ${request.before === null ? '' : 'and seq < $before'}
        order by seq desc limit $limit`,
      {
        ...roots.parameters,
        from: request.from,
        limit: request.limit,
        ...(request.before === null ? {} : { before: request.before }),
      },
    );
    return windowOf(rows, request.limit);
  }

  private rowAt(seq: number): DriveFeedRow {
    return found(
      this.context.sql.get(STORED_ROW, `select ${COLUMNS} from drive_feed where seq = $seq`, {
        seq,
      }),
      'drive feed row',
      String(seq),
    );
  }
}
