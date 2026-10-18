import type { Logger } from '@smarteverything/logging';
import type { DatabaseSync } from 'node:sqlite';
import { RepeatLog } from '../providers/repeat-log';
import { Sql } from './sql';
import { SqlWatch, STATEMENT_LOGGED_CHARS } from './sql-tally';

const SUMMARY_MS = 60_000;

const SLOW_REPORT_WINDOW_MS = 10_000;

export interface ReportedSql {
  readonly sql: Sql;
  readonly stop: () => void;
}

export function reportedSql(database: DatabaseSync, log: Logger): ReportedSql {
  const slow = new RepeatLog(log, SLOW_REPORT_WINDOW_MS);
  const watch = new SqlWatch(log);
  const sql: Sql = new Sql(
    database,
    (statement) => {
      slow.warn('store.statement_slow', `${statement.kind}|${statement.text}`, {
        kind: statement.kind,
        durationMs: Math.round(statement.durationMs),
        rows: statement.rows,
        statement: statement.text.replaceAll(/\s+/g, ' ').slice(0, STATEMENT_LOGGED_CHARS),
      });
    },
    watch,
  );
  watch.attach(sql);
  let reported = sql.totals;
  const summary = setInterval(() => {
    const totals = sql.totals;
    log.debug('store.sql_summary', {
      statements: totals.statements - reported.statements,
      totalMs: Math.round(totals.totalMs - reported.totalMs),
      slow: totals.slow - reported.slow,
      windowMs: SUMMARY_MS,
    });
    reported = totals;
    const drained = watch.drain();
    if (drained.tables > 0) {
      log.debug('store.table_summary', () => ({ ...drained, windowMs: SUMMARY_MS }));
    }
  }, SUMMARY_MS);
  summary.unref();
  return {
    sql,
    stop: (): void => {
      clearInterval(summary);
      log.info('store.closing', {
        statements: sql.totals.statements,
        slow: sql.totals.slow,
      });
    },
  };
}
