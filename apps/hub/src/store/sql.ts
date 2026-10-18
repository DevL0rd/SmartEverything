import type { DatabaseSync } from 'node:sqlite';
import { type SQLInputValue, type StatementSync } from 'node:sqlite';
import { z } from 'zod';
import { messageOf } from '@smarteverything/logging';

export type SqlParameters = Readonly<Record<string, SQLInputValue>>;

export class StoreConflictError extends Error {
  override readonly name = 'StoreConflictError';

  constructor(
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(`The store refused to ${operation}: ${messageOf(cause)}.`);
  }
}

const CONSTRAINT = /constraint failed/i;

function isConstraintFailure(cause: unknown): boolean {
  return cause instanceof Error && CONSTRAINT.test(cause.message);
}

export interface SlowStatement {
  readonly kind: 'all' | 'get' | 'run' | 'transaction';
  readonly text: string;
  readonly durationMs: number;
  readonly rows?: number;
}

const SLOW_STATEMENT_MS = 50;

export interface SqlObserver {
  readonly statement: (
    kind: SlowStatement['kind'],
    text: string,
    durationMs: number,
    rows: number | undefined,
  ) => void;
  readonly transaction: (
    outcome: 'commit' | 'rollback',
    durationMs: number,
    changes: number,
    cause?: unknown,
  ) => void;
}

export class Sql {
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;
  private changed = 0;
  private executed = 0;
  private spentMs = 0;
  private slowCount = 0;

  constructor(
    readonly database: DatabaseSync,
    private readonly onSlow?: (statement: SlowStatement) => void,
    private readonly observer?: SqlObserver,
  ) {}

  get totals(): { readonly statements: number; readonly totalMs: number; readonly slow: number } {
    return { statements: this.executed, totalMs: this.spentMs, slow: this.slowCount };
  }

  private timed(kind: SlowStatement['kind'], text: string, startedAt: number, rows?: number): void {
    const durationMs = performance.now() - startedAt;
    this.executed += 1;
    this.spentMs += durationMs;
    if (this.observer !== undefined && kind !== 'transaction') {
      this.observer.statement(kind, text, durationMs, rows);
    }
    if (durationMs >= SLOW_STATEMENT_MS) {
      this.slowCount += 1;
      this.onSlow?.({ kind, text, durationMs, ...(rows === undefined ? {} : { rows }) });
    }
  }

  all<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = {}): T[] {
    const startedAt = performance.now();
    const rows = z.array(schema).parse(this.prepared(text).all(parameters));
    this.timed('all', text, startedAt, rows.length);
    return rows;
  }

  get<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = {}): T | undefined {
    const startedAt = performance.now();
    const row = this.prepared(text).get(parameters);
    const parsed = row === undefined ? undefined : schema.parse(row);
    this.timed('get', text, startedAt, row === undefined ? 0 : 1);
    return parsed;
  }

  run(operation: string, text: string, parameters: SqlParameters = {}): number {
    const startedAt = performance.now();
    try {
      const { changes } = this.prepared(text).run(parameters);
      this.changed += Number(changes);
      this.timed('run', text, startedAt, Number(changes));
      return Number(changes);
    } catch (cause) {
      if (isConstraintFailure(cause)) {
        throw new StoreConflictError(operation, cause);
      }
      throw cause;
    }
  }

  get mutations(): number {
    return this.changed;
  }

  transaction<T>(work: () => T): T {
    if (this.depth > 0) {
      return work();
    }
    const startedAt = performance.now();
    const changedBefore = this.changed;
    this.database.exec('begin immediate');
    this.depth = 1;
    try {
      const result = work();
      this.database.exec('commit');
      this.timed('transaction', 'begin immediate ... commit', startedAt);
      this.observer?.transaction(
        'commit',
        performance.now() - startedAt,
        this.changed - changedBefore,
      );
      return result;
    } catch (cause) {
      this.database.exec('rollback');
      this.timed('transaction', 'begin immediate ... rollback', startedAt);
      this.observer?.transaction(
        'rollback',
        performance.now() - startedAt,
        this.changed - changedBefore,
        cause,
      );
      throw cause;
    } finally {
      this.depth = 0;
    }
  }

  inTransaction(): boolean {
    return this.depth > 0;
  }

  private prepared(text: string): StatementSync {
    const cached = this.statements.get(text);
    if (cached !== undefined) {
      return cached;
    }
    const statement = this.database.prepare(text);
    this.statements.set(text, statement);
    return statement;
  }
}

export function flag(value: boolean): number {
  return value ? 1 : 0;
}

export function whenDefined<T, R>(value: T | undefined, convert: (value: T) => R): R | undefined {
  return value === undefined ? undefined : convert(value);
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export interface SqlFilter {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

export function inList(column: string, name: string, values: readonly string[]): SqlFilter {
  return {
    text: `${column} in (select value from json_each($${name}))`,
    parameters: { [name]: jsonText(values) },
  };
}

export function allOf(filters: readonly SqlFilter[]): SqlFilter {
  return {
    text: filters.map((filter) => filter.text).join(' and '),
    parameters: Object.fromEntries(filters.flatMap((filter) => Object.entries(filter.parameters))),
  };
}

export const SQL_FLAG = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1);

export const SQL_JSON = z.string().transform((text): unknown => JSON.parse(text));
