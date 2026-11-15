import { DatabaseSync } from 'node:sqlite';
import { RELEASE_ARTIFACTS, buildSourceSettingId } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { BUILD_SOURCES_MIGRATION } from '../../src/store/migrations/build-sources';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-14T08:00:00.000Z';
const ROWS = z.array(z.object({ key: z.string(), settings: z.string() }));
const BEFORE = MIGRATIONS.filter(
  (migration) => migration.version < BUILD_SOURCES_MIGRATION.version,
);

function open(): { database: DatabaseSync; sql: Sql } {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  return { database, sql: new Sql(database) };
}

function sources(database: DatabaseSync): z.infer<typeof ROWS> {
  return ROWS.parse(
    database
      .prepare(
        "select key, settings from ai_settings where key like 'updates.buildSource.%' order by key",
      )
      .all(),
  );
}

describe('the build sources migration', () => {
  it('takes the next free number after the latest earlier migration', () => {
    expect(BUILD_SOURCES_MIGRATION.version).toBe(
      Math.max(...BEFORE.map((migration) => migration.version)) + 1,
    );
  });

  it('gives every artifact of an existing database the provided source', () => {
    const { database, sql } = open();
    migrate(sql, BEFORE, NOW, testLogger());
    expect(sources(database)).toEqual([]);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(sources(database)).toEqual(
      RELEASE_ARTIFACTS.map((artifact) => buildSourceSettingId(artifact))
        .toSorted()
        .map((key) => ({ key, settings: '{"source":"provided"}' })),
    );
  });

  it('seeds a fresh database the same way and does not run twice', () => {
    const { database, sql } = open();
    migrate(sql, MIGRATIONS, NOW, testLogger());
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(sources(database)).toHaveLength(RELEASE_ARTIFACTS.length);
  });
});
