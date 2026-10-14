import type { DatabaseSync } from 'node:sqlite';
import { type SQLInputValue, type StatementSync } from 'node:sqlite';
import { z } from 'zod';

export type SqlParameters = Readonly<Record<string, SQLInputValue>>;

export class StoreConflictError extends Error {
  override readonly name = 'StoreConflictError';

  constructor(
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(
      `The store refused to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
}

const CONSTRAINT = /constraint failed/i;
const MUTATION_COUNT = z.strictObject({ count: z.int().nonnegative() });

function isConstraintFailure(cause: unknown): boolean {
  return cause instanceof Error && CONSTRAINT.test(cause.message);
}

export class Sql {
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(readonly database: DatabaseSync) {}

  all<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = {}): T[] {
    return z.array(schema).parse(this.prepared(text).all(parameters));
  }

  get<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = {}): T | undefined {
    const row = this.prepared(text).get(parameters);
    return row === undefined ? undefined : schema.parse(row);
  }

  run(operation: string, text: string, parameters: SqlParameters = {}): number {
    try {
      return Number(this.prepared(text).run(parameters).changes);
    } catch (cause) {
      if (isConstraintFailure(cause)) {
        throw new StoreConflictError(operation, cause);
      }
      throw cause;
    }
  }

  mutationCount(): number {
    return MUTATION_COUNT.parse(this.prepared('select total_changes() as count').get()).count;
  }

  transaction<T>(work: () => T): T {
    if (this.depth > 0) {
      return work();
    }
    this.database.exec('begin immediate');
    this.depth = 1;
    try {
      const result = work();
      this.database.exec('commit');
      return result;
    } catch (cause) {
      this.database.exec('rollback');
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

export function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export const SQL_FLAG = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1);

export const SQL_JSON = z.string().transform((text): unknown => JSON.parse(text));
