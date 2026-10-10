import type { LogPayload, Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Migration } from './migrations';
import type { Sql } from './sql';

class SchemaTooNewError extends Error {
  override readonly name = 'SchemaTooNewError';

  constructor(found: number, known: number) {
    super(
      `The database is at schema version ${String(found)}, but this server only knows up to ${String(known)}; a newer server wrote it.`,
    );
  }
}

const VERSION = z.object({ version: z.number().int() });

class ForeignKeyViolationError extends Error {
  override readonly name = 'ForeignKeyViolationError';

  constructor(migration: string, violations: number) {
    super(
      `Migration ${migration} left ${String(violations)} rows pointing at rows that do not exist; it was rolled back.`,
    );
  }
}

const VIOLATION = z.object({ table: z.string() });

function apply(sql: Sql, migration: Migration, now: string): LogPayload {
  return sql.transaction(() => {
    for (const statement of migration.statements) {
      sql.database.exec(statement);
    }
    const outcome = migration.backfill?.(sql) ?? {};
    const violations = sql.all(VIOLATION, 'pragma foreign_key_check');
    if (violations.length > 0) {
      throw new ForeignKeyViolationError(migration.name, violations.length);
    }
    sql.run(
      'record the schema version',
      'insert into schema_version (version, name, applied_at) values ($version, $name, $now)',
      { version: migration.version, name: migration.name, now },
    );
    return outcome;
  });
}

function withForeignKeys<T>(sql: Sql, migration: Migration, work: () => T): T {
  if (migration.foreignKeys !== 'off') {
    return work();
  }
  sql.database.exec('pragma foreign_keys = off');
  try {
    return work();
  } finally {
    sql.database.exec('pragma foreign_keys = on');
  }
}

export function migrate(
  sql: Sql,
  migrations: readonly Migration[],
  now: string,
  log: Logger,
): number {
  sql.database.exec(
    'create table if not exists schema_version (version integer primary key, name text not null, applied_at text not null) strict',
  );
  const current = sql.get(
    VERSION,
    'select coalesce(max(version), 0) as version from schema_version',
  );
  const applied = current?.version ?? 0;
  const known = migrations.reduce((latest, migration) => Math.max(latest, migration.version), 0);
  if (applied > known) {
    throw new SchemaTooNewError(applied, known);
  }
  for (const migration of migrations.filter((candidate) => candidate.version > applied)) {
    const backfilled = withForeignKeys(sql, migration, () => apply(sql, migration, now));
    log.info('store.migrated', { version: migration.version, name: migration.name, ...backfilled });
  }
  return known;
}
