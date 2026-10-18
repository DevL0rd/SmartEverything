import { Logger, passesThreshold, messageOf } from '@smarteverything/logging';
import type { Sql, SqlObserver } from './sql';

export const STATEMENT_LOGGED_CHARS = 160;

const TRANSACTION_NOTED_MS = 20;

const TOP_TABLES = 10;

const TABLE_PATTERNS: readonly RegExp[] = [
  /^\s*insert\s+(?:or\s+\w+\s+)?into\s+"?(\w+)/i,
  /^\s*update\s+(?:or\s+\w+\s+)?"?(\w+)/i,
  /^\s*delete\s+from\s+"?(\w+)/i,
  /\bfrom\s+"?(\w+)/i,
];

interface TableTally {
  statements: number;
  totalMs: number;
  maxMs: number;
  rows: number;
}

const tableNames = new Map<string, string>();

function tableOf(text: string): string {
  const known = tableNames.get(text);
  if (known !== undefined) return known;
  let table = 'other';
  for (const pattern of TABLE_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1] !== undefined) {
      table = match[1].toLowerCase();
      break;
    }
  }
  tableNames.set(text, table);
  return table;
}

class SqlTally {
  private tables = new Map<string, TableTally>();
  private transactions = 0;
  private rollbacks = 0;
  private transactionMs = 0;
  private changes = 0;

  statement(kind: string, text: string, durationMs: number, rows: number | undefined): void {
    const key = `${kind}:${tableOf(text)}`;
    const tally = this.tables.get(key) ?? { statements: 0, totalMs: 0, maxMs: 0, rows: 0 };
    tally.statements += 1;
    tally.totalMs += durationMs;
    tally.maxMs = Math.max(tally.maxMs, durationMs);
    tally.rows += rows ?? 0;
    this.tables.set(key, tally);
  }

  transaction(outcome: 'commit' | 'rollback', durationMs: number, changes: number): void {
    this.transactions += 1;
    this.transactionMs += durationMs;
    this.changes += changes;
    if (outcome === 'rollback') this.rollbacks += 1;
  }

  drain(): {
    readonly top: Readonly<Record<string, string>>;
    readonly tables: number;
    readonly transactions: number;
    readonly rollbacks: number;
    readonly transactionMs: number;
    readonly changes: number;
  } {
    const ranked = [...this.tables].toSorted((a, b) => b[1].totalMs - a[1].totalMs);
    const top: Record<string, string> = {};
    for (const [key, tally] of ranked.slice(0, TOP_TABLES)) {
      top[key] =
        `n=${String(tally.statements)} rows=${String(tally.rows)} ms=${String(Math.round(tally.totalMs))} maxMs=${String(Math.round(tally.maxMs))}`;
    }
    const drained = {
      top,
      tables: this.tables.size,
      transactions: this.transactions,
      rollbacks: this.rollbacks,
      transactionMs: Math.round(this.transactionMs),
      changes: this.changes,
    };
    this.tables = new Map();
    this.transactions = 0;
    this.rollbacks = 0;
    this.transactionMs = 0;
    this.changes = 0;
    return drained;
  }
}

export class SqlWatch implements SqlObserver {
  private readonly tally = new SqlTally();
  private sql: Sql | null = null;

  constructor(private readonly log: Logger) {}

  attach(sql: Sql): void {
    this.sql = sql;
  }

  drain(): ReturnType<SqlTally['drain']> {
    return this.tally.drain();
  }

  statement(kind: string, text: string, durationMs: number, rows: number | undefined): void {
    this.tally.statement(kind, text, durationMs, rows);
    if (kind === 'run' && passesThreshold('trace', Logger.level)) {
      this.log.trace('store.statement_ran', () => ({
        table: tableOf(text),
        changes: rows,
        durationMs: Math.round(durationMs * 100) / 100,
        inTransaction: this.sql?.inTransaction(),
      }));
    }
  }

  transaction(
    outcome: 'commit' | 'rollback',
    durationMs: number,
    changes: number,
    cause?: unknown,
  ): void {
    this.tally.transaction(outcome, durationMs, changes);
    if (outcome === 'rollback') {
      this.log.warn('store.transaction_rolled_back', {
        durationMs: Math.round(durationMs),
        changes,
        errorName: cause instanceof Error ? cause.name : typeof cause,
        reason: messageOf(cause).slice(0, STATEMENT_LOGGED_CHARS),
      });
    } else if (durationMs >= TRANSACTION_NOTED_MS) {
      this.log.debug('store.transaction_committed', {
        durationMs: Math.round(durationMs),
        changes,
      });
    } else if (passesThreshold('trace', Logger.level)) {
      this.log.trace('store.transaction_committed', {
        durationMs: Math.round(durationMs),
        changes,
      });
    }
  }
}
