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

function device(): void {
  database
    .prepare(
      `insert or ignore into devices (id, provider, external_id, kind, name, model, manufacturer, capabilities, details, created_at, updated_at)
       values ('d', 'local', 'oralb_io:x', 'other', 'Oral-B iO', 'oralb.toothbrush.io32', 'oralb', '[]', '{}', ?, ?)`,
    )
    .run(NOW, NOW);
}

function insert(id: string, details: string | null): void {
  device();
  database
    .prepare(
      `insert into brushing_sessions (id, device_id, started_at, zone_offset_seconds, duration_s, routine_s, source, complete, zones${
        details === null ? '' : ', details'
      }) values (?, 'd', ?, 0, 120, 120, 'observed', 1, '[]'${details === null ? '' : ', ?'})`,
    )
    .run(...(details === null ? [id, NOW] : [id, NOW, details]));
}

function details(): unknown[] {
  return ROWS.parse(
    database.prepare('select id, details from brushing_sessions order by id').all(),
  ).map((row) => row['details']);
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

describe('the brushing session details column', () => {
  it('leaves the sessions an upgrade finds without details', () => {
    upTo(121);
    insert('a', null);
    upTo(122);
    expect(details()).toStrictEqual([null]);
  });

  it('keeps a JSON object and refuses text that is not JSON', () => {
    upTo(122);
    insert('a', '{"zoneSource":"pacer","face":3,"batteryEnd":88,"handleUser":1,"sectors":4}');
    expect(details()).toStrictEqual([
      '{"zoneSource":"pacer","face":3,"batteryEnd":88,"handleUser":1,"sectors":4}',
    ]);
    expect(() => {
      insert('b', 'not json');
    }).toThrow();
  });
});
