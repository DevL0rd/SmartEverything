import { z } from 'zod';
import { DAY_MS } from '../metrics/minute';
import type { Sql } from './sql';

export const SERVICE_LOG_LINE_BYTES = 410;

export const PER_RUNTIME_ROWS = 108_000;

export const PER_RUNTIME_BYTES = PER_RUNTIME_ROWS * SERVICE_LOG_LINE_BYTES;

export const RUNTIME_LOG_RETENTION_BYTES = PER_RUNTIME_BYTES * 3;

export const RUNTIME_LOG_SOURCE_STALE_MS = DAY_MS;

const RETENTION_KEY = 'runtime-logs';

const RUNTIMES = ['app', 'edge', 'db', 'tool', 'hub', 'desktop'] as const;

const COUNT = z.object({ kept: z.number() });

const AVERAGE = z.object({ bytes: z.number() });

const FOOTPRINT = z.object({ bytes: z.number(), measured_at: z.string().nullable() });

const SIZES = z.object({ pages: z.number(), sizes: z.number() });

const COUNT_PAGES =
  'select (select page_count from pragma_page_count) as pages, (select page_size from pragma_page_size) as sizes';

const GUARD_BYTES = 160;

const CONTENT = `length(cast(payload as blob)) + length(cast(coalesce(failure, '') as blob)) + length(cast(component as blob)) + length(cast(scope as blob)) + length(cast(event as blob)) + length(cast(coalesce(signature, '') as blob))`;

const LINE = `length(cast(at as blob)) + length(cast(source as blob)) + length(cast(runtime as blob)) + length(cast(platform as blob)) + length(cast(coalesce(device_id, '') as blob)) + length(cast(coalesce(client_id, '') as blob)) + length(cast(level as blob)) + length(cast(recorded_at as blob)) + ${CONTENT}`;

export interface LogFootprint {
  readonly bytes: number;
  readonly rows: number;
  readonly lineBytes: number;
  readonly measuredAt: string | null;
}

function databaseBytes(sql: Sql): number {
  const counted = sql.get(SIZES, COUNT_PAGES);
  return (counted?.pages ?? 0) * (counted?.sizes ?? 0);
}

function rowCount(sql: Sql): number {
  return sql.get(COUNT, 'select count(*) as kept from runtime_logs')?.kept ?? 0;
}

function lineBytes(sql: Sql): number {
  const line = sql.get(AVERAGE, `select coalesce(avg(${LINE}), $line) as bytes from runtime_logs`, {
    line: SERVICE_LOG_LINE_BYTES,
  });
  return line?.bytes ?? SERVICE_LOG_LINE_BYTES;
}

export function recordLogFootprint(sql: Sql, now: Date): LogFootprint {
  const bytes = databaseBytes(sql);
  sql.run(
    'record the runtime log footprint',
    `insert into runtime_log_footprint (key, bytes, measured_at) values ($key, $bytes, $now)
     on conflict (key) do update set bytes = excluded.bytes, measured_at = excluded.measured_at`,
    { key: RETENTION_KEY, bytes, now: now.toISOString() },
  );
  return readLogFootprint(sql);
}

export function readLogFootprint(sql: Sql): LogFootprint {
  const saved = sql.get(FOOTPRINT, 'select bytes, measured_at from runtime_log_footprint', {});
  return {
    bytes: saved?.bytes ?? 0,
    rows: rowCount(sql),
    lineBytes: lineBytes(sql),
    measuredAt: saved?.measured_at ?? null,
  };
}

const TRIM_BATCH_ROWS = 2_000;

const BOUNDARY = z.object({ at: z.string(), id: z.number() });

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

function trim(sql: Sql, runtime: string): number {
  const boundary = boundaryOf(sql, runtime);
  if (boundary === undefined) return 0;
  let removed = 0;
  for (;;) {
    const batch = sql.transaction(() =>
      sql.run(
        'forget one batch of the oldest runtime logs of a runtime beyond its budget',
        `delete from runtime_logs where id in (
           select id from runtime_logs
           where runtime = $runtime and (at, id) <= ($at, $id)
           order by at, id limit $batch
         )`,
        { runtime, at: boundary.at, id: boundary.id, batch: TRIM_BATCH_ROWS },
      ),
    );
    removed += batch;
    if (batch < TRIM_BATCH_ROWS) return removed;
  }
}

export function sweepRuntimeLogs(sql: Sql, now: Date): Record<string, number> {
  const trimmed = RUNTIMES.map((runtime) => trim(sql, runtime));
  return sql.transaction(() => {
    const stale = sql.run(
      'forget sources that sent nothing for a day',
      'delete from runtime_log_sources where last_at < $before',
      { before: new Date(now.getTime() - RUNTIME_LOG_SOURCE_STALE_MS).toISOString() },
    );
    recordLogFootprint(sql, now);
    return {
      runtime_logs: trimmed.reduce((total, removed) => total + removed, 0),
      runtime_log_sources: stale,
    };
  });
}
