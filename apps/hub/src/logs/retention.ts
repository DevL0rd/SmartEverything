import { z } from 'zod';
import { DAY_MS } from '../metrics/minute';
import type { Sql, SqlParameters } from '../store/sql';

export const SERVICE_LOG_LINE_BYTES = 410;

export const PER_RUNTIME_ROWS = 108_000;

export const PER_RUNTIME_BYTES = PER_RUNTIME_ROWS * SERVICE_LOG_LINE_BYTES;

export const RUNTIME_LOG_KEEP_MS = 14 * DAY_MS;

export const RUNTIME_LOG_SWEEP_SLACK_MS = DAY_MS;

const RUNTIME_LOG_SOURCE_STALE_MS = DAY_MS;

const RUNTIMES = ['app', 'edge', 'db', 'tool', 'hub', 'desktop'] as const;

const TRIM_BATCH_ROWS = 2_000;

const MERGE_PAGES = 500;

const GUARD_BYTES = 160;

const CONTENT = `length(cast(payload as blob)) + length(cast(coalesce(failure, '') as blob)) + length(cast(component as blob)) + length(cast(scope as blob)) + length(cast(event as blob)) + length(cast(coalesce(signature, '') as blob))`;

const BOUNDARY = z.object({ at: z.string(), id: z.number() });

const OLDEST = z.object({ at: z.string().nullable() });

const CHANGES = z.object({ changes: z.int() });

export interface LogSweep {
  readonly removed: Readonly<Record<string, number>>;
  readonly dueAt: number;
}

function boundaryOf(sql: Sql, runtime: string): z.infer<typeof BOUNDARY> | undefined {
  return sql.get(
    BOUNDARY,
    `with ranked as (
       select at, id, row_number() over (order by at desc, id desc) as rank, ${CONTENT} as bytes
       from runtime_logs where runtime = $runtime
     ), counted as (
       select at, id, rank, sum(bytes) over (order by rank) as carried from ranked
     )
     select at, id from counted where carried > $content or rank > $rows order by rank limit 1`,
    {
      runtime,
      content: PER_RUNTIME_BYTES - PER_RUNTIME_ROWS * GUARD_BYTES,
      rows: PER_RUNTIME_ROWS,
    },
  );
}

function one<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`The runtime log database returned no ${what}.`);
  return row;
}

function inBatches(sql: Sql, operation: string, text: string, parameters: SqlParameters): number {
  let removed = 0;
  for (;;) {
    const batch = sql.transaction(() =>
      sql.run(operation, text, { ...parameters, batch: TRIM_BATCH_ROWS }),
    );
    removed += batch;
    if (batch < TRIM_BATCH_ROWS) return removed;
  }
}

function trimRuntime(sql: Sql, runtime: string): number {
  const boundary = boundaryOf(sql, runtime);
  if (boundary === undefined) return 0;
  return inBatches(
    sql,
    'forget one batch of the oldest runtime logs of a runtime beyond its budget',
    `delete from runtime_logs where id in (
       select id from runtime_logs
       where runtime = $runtime and (at, id) <= ($at, $id)
       order by at, id limit $batch
     )`,
    { runtime, at: boundary.at, id: boundary.id },
  );
}

function forgetAged(sql: Sql, before: string): number {
  return inBatches(
    sql,
    'forget one batch of runtime logs older than the kept window',
    `delete from runtime_logs where id in (
       select id from runtime_logs where at < $before order by at, id limit $batch
     )`,
    { before },
  );
}

function totalChanges(sql: Sql): number {
  return one(sql.get(CHANGES, 'select total_changes() as changes'), 'change count').changes;
}

function mergeSearch(sql: Sql): void {
  for (;;) {
    const before = totalChanges(sql);
    sql.run(
      'merge the runtime log search index and drop its forgotten entries',
      `insert into runtime_logs_search (runtime_logs_search, rank) values ('merge', $pages)`,
      { pages: MERGE_PAGES },
    );
    if (totalChanges(sql) - before < 2) return;
  }
}

function dueAt(sql: Sql, now: Date): number {
  const { at } = one(sql.get(OLDEST, 'select min(at) as at from runtime_logs'), 'oldest record');
  const from = at === null ? now.getTime() : Date.parse(at);
  return from + RUNTIME_LOG_KEEP_MS + RUNTIME_LOG_SWEEP_SLACK_MS;
}

export function sweepRuntimeLogs(sql: Sql, now: Date): LogSweep {
  const before = new Date(now.getTime() - RUNTIME_LOG_KEEP_MS).toISOString();
  const aged = forgetAged(sql, before);
  const trimmed = RUNTIMES.reduce((total, runtime) => total + trimRuntime(sql, runtime), 0);
  const gaps = sql.run(
    'forget runtime log gaps older than the kept window',
    'delete from runtime_log_gaps where recorded_at < $before',
    { before },
  );
  const stale = sql.run(
    'forget sources that sent nothing for a day',
    'delete from runtime_log_sources where last_at < $before',
    { before: new Date(now.getTime() - RUNTIME_LOG_SOURCE_STALE_MS).toISOString() },
  );
  if (aged + trimmed > 0) mergeSearch(sql);
  return {
    removed: {
      runtime_logs: aged + trimmed,
      runtime_log_gaps: gaps,
      runtime_log_sources: stale,
    },
    dueAt: dueAt(sql, now),
  };
}
