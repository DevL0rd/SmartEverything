import { randomUUID } from 'node:crypto';
import type { LiveTable, RowOperation, TableRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import type { ChangeFeed } from './feed';
import type { Sql, SqlParameters } from './sql';

export class StoreNotFoundError extends Error {
  override readonly name = 'StoreNotFoundError';

  constructor(
    readonly what: string,
    readonly key: string,
  ) {
    super(`There is no ${what} ${key}.`);
  }
}

export interface Assignment {
  readonly text: string;
  readonly parameters: SqlParameters;
}

const COLUMN = /^[a-z][a-z_]*$/;

class UnsafeColumnError extends Error {
  override readonly name = 'UnsafeColumnError';

  constructor(column: string) {
    super(`The column name ${JSON.stringify(column)} is not a plain lower-case identifier.`);
  }
}

export function assignments(
  values: Readonly<Record<string, SQLInputValue | undefined>>,
): Assignment {
  const parameters: Record<string, SQLInputValue> = {};
  for (const [column, value] of Object.entries(values)) {
    if (value !== undefined) {
      parameters[column] = value;
    }
  }
  const columns = Object.keys(parameters);
  for (const column of columns) {
    if (!COLUMN.test(column)) {
      throw new UnsafeColumnError(column);
    }
  }
  return {
    text: columns.map((column) => `${column} = $${column}`).join(', '),
    parameters,
  };
}

export function found<T>(row: T | undefined, what: string, key: string): T {
  if (row === undefined) {
    throw new StoreNotFoundError(what, key);
  }
  return row;
}

export class StoreContext {
  constructor(
    readonly sql: Sql,
    private readonly feed: ChangeFeed,
    private readonly clock: () => Date,
  ) {}

  now(): string {
    return this.clock().toISOString();
  }

  newId(): string {
    return randomUUID();
  }

  write<T>(work: () => T): T {
    if (this.sql.inTransaction()) {
      return work();
    }
    this.feed.hold();
    try {
      const previous = this.sql.mutationCount();
      const result = this.sql.transaction(() => {
        const value = work();
        return { value, mutated: this.sql.mutationCount() !== previous };
      });
      this.feed.release();
      if (result.mutated) this.feed.committed();
      return result.value;
    } catch (cause) {
      this.feed.discard();
      throw cause;
    }
  }

  changed<T extends LiveTable>(
    table: T,
    operation: RowOperation,
    record: TableRow<T> | null,
    oldRecord: TableRow<T> | null,
  ): void {
    this.feed.emit({ type: 'change', table, operation, record, oldRecord });
  }
}

export function moment(value: string): string {
  return new Date(value).toISOString();
}
