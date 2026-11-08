import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ASSISTANT_SETTINGS, JSON_VALUE } from '@smarteverything/domain';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { IMAGE_FALLBACK_ORDER_DROP_MIGRATION } from '../../src/store/migrations/image-fallback-order-drop';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-28T05:00:00.000Z';
const ROW = z.object({ settings: z.string() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  migrate(
    new Sql(database),
    MIGRATIONS.filter(
      (migration) => migration.version < IMAGE_FALLBACK_ORDER_DROP_MIGRATION.version,
    ),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

function stored(settings: unknown): void {
  database
    .prepare('insert into assistant_settings (id, settings, updated_at) values (1, ?, ?)')
    .run(JSON.stringify(settings), NOW);
}

function settings(): unknown {
  const row = ROW.parse(database.prepare('select settings from assistant_settings').get());
  return JSON_VALUE.parse(JSON.parse(row.settings));
}

describe('dropping the image fallback order setting', () => {
  it('removes the stored order and keeps the picked model', () => {
    stored({
      image_model: { model: 'vendor/m1', provider_tag: 'tag' },
      image_fallback_order: [{ model: 'vendor/m2', provider_tag: 'tag' }],
    });

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    expect(settings()).toStrictEqual({
      image_model: { model: 'vendor/m1', provider_tag: 'tag' },
    });
    expect(ASSISTANT_SETTINGS.safeParse(settings()).success).toBe(true);
  });

  it('leaves settings without an order unchanged', () => {
    stored({ image_defaults: {} });

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    expect(settings()).toStrictEqual({ image_defaults: {} });
  });
});
