import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PAUSE_MS } from '@smarteverything/domain';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let database: DatabaseSync;

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function pauses(): unknown[] {
  return ROWS.parse(
    database.prepare('select end_of_speech_pause_ms as ms from settings').all(),
  ).map((row) => row['ms']);
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

describe('the end-of-speech pause column', () => {
  it('gives an existing home the default pause', () => {
    upTo(102);
    database.exec(
      `insert or ignore into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`,
    );
    upTo(103);
    expect(pauses()).toEqual([DEFAULT_PAUSE_MS]);
  });

  it('accepts only the pauses the apps offer', () => {
    upTo(103);
    database.exec(
      `insert or ignore into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`,
    );
    database.exec('update settings set end_of_speech_pause_ms = 2500');
    expect(pauses()).toEqual([2500]);
    expect(() => {
      database.exec('update settings set end_of_speech_pause_ms = 500');
    }).toThrow();
  });
});
