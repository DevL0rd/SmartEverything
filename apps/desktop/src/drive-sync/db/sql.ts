import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';

export type SqlParameters = readonly SQLInputValue[];

export const INTEGER = z.bigint().transform((value) => Number(value));
export const FLAG = z.bigint().transform((value) => value === 1n);
export const NANOSECONDS = z.bigint();

export class ClientSql {
  constructor(readonly database: DatabaseSync) {}

  get<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = []): T | undefined {
    const statement = this.database.prepare(text);
    statement.setReadBigInts(true);
    const row = statement.get(...parameters);
    return row === undefined ? undefined : schema.parse(row);
  }

  all<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = []): readonly T[] {
    const statement = this.database.prepare(text);
    statement.setReadBigInts(true);
    return statement.all(...parameters).map((row) => schema.parse(row));
  }

  run(text: string, parameters: SqlParameters = []): number {
    return Number(this.database.prepare(text).run(...parameters).changes);
  }

  transaction<T>(work: () => T): T {
    if (this.database.isTransaction) return work();
    this.database.exec('begin immediate');
    try {
      const result = work();
      this.database.exec('commit');
      return result;
    } catch (cause) {
      this.database.exec('rollback');
      throw cause;
    }
  }
}
