import type { LogPayload, Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { backUpBeforeMigrating } from './migration-backup';
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

function apply(sql: Sql, migration: Migration, now: string, log: Logger): LogPayload {
  return sql.transaction(() => {
    const statementsAt = performance.now();
    for (const statement of migration.statements) {
      sql.database.exec(statement);
    }
    const backfillAt = performance.now();
    log.debug('store.migration_statements_ran', {
      version: migration.version,
      name: migration.name,
      statements: migration.statements.length,
      durationMs: Math.round(backfillAt - statementsAt),
    });
    const outcome = migration.backfill?.(sql, now) ?? {};
    if (migration.backfill !== undefined) {
      log.debug('store.migration_backfilled', () => ({
        version: migration.version,
        name: migration.name,
        durationMs: Math.round(performance.now() - backfillAt),
        ...outcome,
      }));
    }
    const violations = sql.all(VIOLATION, 'pragma foreign_key_check');
    log.debug('store.migration_foreign_keys_checked', () => ({
      version: migration.version,
      violations: violations.length,
      tables: [...new Set(violations.map((violation) => violation.table))],
    }));
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

function withForeignKeys<T>(sql: Sql, migration: Migration, log: Logger, work: () => T): T {
  if (migration.foreignKeys !== 'off') {
    return work();
  }
  sql.database.exec('pragma foreign_keys = off');
  log.debug('store.foreign_keys_suspended', { version: migration.version });
  try {
    return work();
  } finally {
    sql.database.exec('pragma foreign_keys = on');
    log.debug('store.foreign_keys_restored', { version: migration.version });
  }
}

function reportPending(
  log: Logger,
  applied: number,
  known: number,
  pending: readonly Migration[],
): void {
  log.info('store.migration_checked', {
    applied,
    known,
    pending: pending.length,
    pendingVersions: pending.map((migration) => migration.version),
  });
  if (pending.length === 0) log.debug('store.migration_skipped', { applied, known });
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
  const pending = migrations.filter((candidate) => candidate.version > applied);
  reportPending(log, applied, known, pending);
  if (applied > 0 && pending.length > 0) {
    backUpBeforeMigrating(sql, applied, known, log);
  }
  for (const migration of pending) {
    const startedAt = performance.now();
    log.debug('store.migration_started', { version: migration.version, name: migration.name });
    let backfilled: LogPayload;
    try {
      backfilled = withForeignKeys(sql, migration, log, () => apply(sql, migration, now, log));
    } catch (cause) {
      log.error('store.migration_failed', cause, {
        version: migration.version,
        name: migration.name,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw cause;
    }
    log.info('store.migrated', {
      version: migration.version,
      name: migration.name,
      durationMs: Math.round(performance.now() - startedAt),
      ...backfilled,
    });
  }
  return known;
}
