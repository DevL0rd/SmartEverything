import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const VERSION =
  MIGRATIONS.find((migration) => migration.name === 'television_settings')?.version ?? 0;
const WAKE_VERSION =
  MIGRATIONS.find((migration) => migration.name === 'television_wake')?.version ?? 0;
const RESULT_VERSION =
  MIGRATIONS.find((migration) => migration.name === 'television_wake_result')?.version ?? 0;
const ADDRESS_VERSION =
  MIGRATIONS.find((migration) => migration.name === 'television_direct_address')?.version ?? 0;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-television-settings-'));
  database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function television(id: string): void {
  database
    .prepare(
      "insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at) values (?, 'smartthings', ?, 'television', 'TV', 'm', 'v', ?, ?)",
    )
    .run(id, id, NOW, NOW);
}

describe('television settings migration', () => {
  it('adds the table after the previous migration and leaves existing devices alone', () => {
    upTo(VERSION - 1);
    television('tv-1');
    expect(() => database.prepare('select * from television_settings').all()).toThrow();
    upTo(VERSION);
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([]);
    expect(ROWS.parse(database.prepare('select id from devices').all())).toEqual([{ id: 'tv-1' }]);
  });

  it('starts a television without a direct link and without names', () => {
    upTo(VERSION);
    television('tv-1');
    database.prepare('insert into television_settings (device_id) values (?)').run('tv-1');
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([
      { device_id: 'tv-1', direct_link: 0, input_names: '{}' },
    ]);
  });

  it('rejects names that are not an object and settings for an unknown device', () => {
    upTo(VERSION);
    television('tv-1');
    const insert = database.prepare(
      'insert into television_settings (device_id, input_names) values (?, ?)',
    );
    expect(() => insert.run('tv-1', '[]')).toThrow();
    expect(() => insert.run('missing', '{}')).toThrow();
  });

  it('drops the settings with the television', () => {
    upTo(VERSION);
    television('tv-1');
    database.prepare('insert into television_settings (device_id) values (?)').run('tv-1');
    database.prepare('delete from devices where id = ?').run('tv-1');
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([]);
  });

  it('keeps existing settings and starts them without a wake address', () => {
    upTo(WAKE_VERSION - 1);
    television('tv-1');
    database.prepare('insert into television_settings (device_id) values (?)').run('tv-1');
    upTo(WAKE_VERSION);
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([
      { device_id: 'tv-1', direct_link: 0, input_names: '{}', wake_macs: '[]', wake_host: null },
    ]);
    const update = database.prepare('update television_settings set wake_macs = ?, wake_host = ?');
    expect(() => update.run('{}', null)).toThrow();
    expect(() => update.run('[]', '')).toThrow();
  });

  it('adds when a wake last worked after the wake columns without touching them', () => {
    upTo(WAKE_VERSION);
    television('tv-1');
    database
      .prepare('insert into television_settings (device_id, wake_macs) values (?, ?)')
      .run('tv-1', '["a1:b2:c3:d4:e5:f6"]');
    upTo(RESULT_VERSION);
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([
      {
        device_id: 'tv-1',
        direct_link: 0,
        input_names: '{}',
        wake_macs: '["a1:b2:c3:d4:e5:f6"]',
        wake_host: null,
        wake_worked_at: null,
      },
    ]);
    expect(() =>
      database.prepare('update television_settings set wake_worked_at = ?').run(''),
    ).toThrow();
  });

  it('replaces the direct link flag and the unused wake host with the direct address of the screen', () => {
    upTo(ADDRESS_VERSION - 1);
    television('tv-1');
    database
      .prepare(
        'insert into television_settings (device_id, direct_link, wake_macs) values (?, 1, ?)',
      )
      .run('tv-1', '["a1:b2:c3:d4:e5:f6"]');
    upTo(ADDRESS_VERSION);
    expect(ROWS.parse(database.prepare('select * from television_settings').all())).toEqual([
      {
        device_id: 'tv-1',
        input_names: '{}',
        wake_macs: '["a1:b2:c3:d4:e5:f6"]',
        wake_worked_at: null,
        direct_host: null,
        direct_mac: null,
      },
    ]);
    const update = database.prepare(
      'update television_settings set direct_host = ?, direct_mac = ?',
    );
    expect(() => update.run('', null)).toThrow();
    expect(() => update.run('192.168.1.40', 'a1:b2')).toThrow();
    update.run('192.168.1.40', 'a1:b2:c3:d4:e5:f6');
  });
});
