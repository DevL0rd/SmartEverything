import type { DatabaseSync } from 'node:sqlite';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { ClientSql, INTEGER } from './sql.js';
import type { ClientMigration } from './migrations.js';

export class ClientSchemaTooNewError extends Error {
  override readonly name = 'ClientSchemaTooNewError';

  constructor(found: number, known: number) {
    super(
      `The drive sync database is at schema version ${String(found)}, but this build only knows up to ${String(known)}; a newer build wrote it.`,
    );
  }
}

const VERSION = z.object({ user_version: INTEGER });

export function migrateClient(
  database: DatabaseSync,
  migrations: readonly ClientMigration[],
  log: Logger,
): number {
  const sql = new ClientSql(database);
  const applied = sql.get(VERSION, 'pragma user_version')?.user_version ?? 0;
  const known = migrations.reduce((latest, migration) => Math.max(latest, migration.version), 0);
  if (applied > known) throw new ClientSchemaTooNewError(applied, known);
  for (const migration of migrations.filter((candidate) => candidate.version > applied)) {
    sql.transaction(() => {
      for (const statement of migration.statements) database.exec(statement);
      database.exec(`pragma user_version = ${String(migration.version)}`);
    });
    log.info('drive_sync.db_migrated', { version: migration.version, name: migration.name });
  }
  return known;
}
