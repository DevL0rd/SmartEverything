import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

function refills(): unknown[] {
  return ROWS.parse(database.prepare('select device_refills as refills from settings').all()).map(
    (row) => row['refills'],
  );
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

describe('the device refills column', () => {
  it('gives an existing home an empty record', () => {
    upTo(109);
    database.exec(
      `insert or ignore into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`,
    );
    upTo(110);
    expect(refills()).toEqual(['{}']);
  });

  it('accepts a map of device ids to times and refuses anything that is not an object', () => {
    upTo(110);
    database.exec(
      `insert or ignore into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`,
    );
    database.exec(`update settings set device_refills = '{"a":"${NOW}"}'`);
    expect(refills()).toEqual([`{"a":"${NOW}"}`]);
    expect(() => {
      database.exec(`update settings set device_refills = '[1]'`);
    }).toThrow();
    expect(() => {
      database.exec(`update settings set device_refills = 'not json'`);
    }).toThrow();
  });
});
