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

function trim(sql: Sql, runtime: string): number {
  return sql.run(
    'forget the oldest runtime logs of a runtime beyond its budget',
    `with ranked as (
       select id, row_number() over (order by at desc, id desc) as rank, ${CONTENT} as bytes
       from runtime_logs where runtime = $runtime
     ), counted as (
       select id, sum(bytes) over (order by rank) as carried from ranked
     )
     delete from runtime_logs where runtime = $runtime and id in (
       select id from counted where carried > $content
       union select id from ranked where rank > $rows
     )`,
    {
      runtime,
      content: PER_RUNTIME_BYTES - PER_RUNTIME_ROWS * GUARD_BYTES,
      rows: PER_RUNTIME_ROWS,
    },
  );
}

export function sweepRuntimeLogs(sql: Sql, now: Date): Record<string, number> {
  return sql.transaction(() => {
    const trimmed = RUNTIMES.map((runtime) => trim(sql, runtime));
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
