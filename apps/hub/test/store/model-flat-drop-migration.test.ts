import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { MODEL_FLAT_DROP_MIGRATION } from '../../src/store/migrations/model-flat-drop';
import { sha256Of } from '../../src/store/repositories/model-assets';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-02T05:00:00.000Z';
const SPEC = new TextEncoder().encode('{"schema":1,"id":"dev.fan.example"}');
const PICTURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const NAMES = z.object({ name: z.string() });
const HASHES = z.object({ sha256: z.string() });
const CATALOG = z.object({ id: z.string(), spec_sha256: z.string() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < MODEL_FLAT_DROP_MIGRATION.version),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

function insertAsset(bytes: Uint8Array, kind: string): string {
  const hash = sha256Of(bytes);
  database
    .prepare(
      'insert into model_assets (sha256, kind, bytes, size, owner, created) values (?, ?, ?, ?, ?, ?)',
    )
    .run(hash, kind, bytes, bytes.length, 'builtin', NOW);
  return hash;
}

function columnsOf(table: string): string[] {
  return database
    .prepare(`select name from pragma_table_info('${table}')`)
    .all()
    .map((row) => NAMES.parse(row).name);
}

describe('dropping the flat model pictures', () => {
  it('keeps the catalogue rows and spec files, and removes the picture column and picture files', () => {
    const spec = insertAsset(SPEC, 'spec');
    const picture = insertAsset(PICTURE, 'image');
    database
      .prepare(
        `insert into model_catalog (id, version, owner, title, category, match, brands, aliases, extras, spec_sha256, flat_sha256)
         values ('dev.fan.example', '1.0.0', 'builtin', 'Fan', 'climate', '{}', '[]', '[]', '[]', ?, ?)`,
      )
      .run(spec, picture);

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    expect(columnsOf('model_catalog')).not.toContain('flat_sha256');
    expect(
      CATALOG.parse(database.prepare('select id, spec_sha256 from model_catalog').get()),
    ).toStrictEqual({ id: 'dev.fan.example', spec_sha256: spec });
    expect(
      database
        .prepare('select sha256 from model_assets')
        .all()
        .map((row) => HASHES.parse(row).sha256),
    ).toStrictEqual([spec]);
    expect(() => insertAsset(PICTURE, 'image')).toThrow();
    expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
  });
});
