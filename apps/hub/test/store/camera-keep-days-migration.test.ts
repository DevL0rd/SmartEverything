import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { CAMERA_KEEP_DAYS_MIGRATION } from '../../src/store/migrations/camera-keep-days';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-20T08:00:00.000Z';
const KEEP = z.array(z.object({ device_id: z.string(), keep_days: z.number() }));
const BEFORE = MIGRATIONS.filter(
  (migration) => migration.version < CAMERA_KEEP_DAYS_MIGRATION.version,
);

function addCamera(database: DatabaseSync, id: string): void {
  database.exec(
    `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
     values ('${id}', 'xiaomi', '${id}', 'camera', '${id}', 'm', 'm', '${NOW}', '${NOW}')`,
  );
  database.exec(
    `insert into cameras (device_id, stream_name, source_url_kind) values ('${id}', '${id}', 'rtsp')`,
  );
}

function open(migrations: typeof MIGRATIONS): { database: DatabaseSync; sql: Sql } {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, migrations, NOW, testLogger());
  return { database, sql };
}

describe('the camera keep days migration', () => {
  it('takes the next free number after the latest earlier migration', () => {
    expect(CAMERA_KEEP_DAYS_MIGRATION.version).toBe(
      Math.max(...BEFORE.map((migration) => migration.version)) + 1,
    );
  });

  it('gives every camera of an existing database 15 days', () => {
    const { database, sql } = open(BEFORE);
    addCamera(database, 'a');
    addCamera(database, 'b');
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(
      KEEP.parse(
        database.prepare('select device_id, keep_days from cameras order by device_id').all(),
      ),
    ).toEqual([
      { device_id: 'a', keep_days: 15 },
      { device_id: 'b', keep_days: 15 },
    ]);
  });

  it('gives a camera on a fresh database 15 days and refuses less than one', () => {
    const { database } = open(MIGRATIONS);
    addCamera(database, 'c');
    expect(KEEP.parse(database.prepare('select device_id, keep_days from cameras').all())).toEqual([
      { device_id: 'c', keep_days: 15 },
    ]);
    expect(() => {
      database.exec("update cameras set keep_days = 0 where device_id = 'c'");
    }).toThrow(/constraint/i);
  });
});
