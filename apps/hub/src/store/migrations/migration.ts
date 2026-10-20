import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
  readonly backfill?: (sql: Sql, now: string) => LogPayload;
  readonly foreignKeys?: 'off';
}
