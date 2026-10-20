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
const BEFORE = 120;
const BLASTER = 'tuya-blaster';
const TUYA_REMOTE = 'tuya-library-remote';
const SAMSUNG_REMOTE = 'samsung-remote';
const LEARNED = 'learned-remote';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-tuya-ir-library-'));
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

function run(sql: string, ...values: (string | number | null)[]): void {
  database.prepare(sql).run(...values);
}

function rows(sql: string): z.output<typeof ROWS> {
  return ROWS.parse(database.prepare(sql).all());
}

function column(sql: string, name: string): unknown[] {
  return rows(sql).map((row) => row[name]);
}

function device(id: string, provider: string, kind: string): void {
  run(
    'insert into devices (id, provider, external_id, kind, name, model, manufacturer, details, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    provider,
    `ext-${id}`,
    kind,
    id,
    'model',
    'maker',
    '{}',
    NOW,
    NOW,
  );
  run(
    "insert into device_state (device_id, capability, value, observed_at) values (?, 'power', 'true', ?)",
    id,
    NOW,
  );
}

function code(id: string, button: string, format: string): void {
  run(
    'insert into ir_codes (id, remote_id, button, format, code, created_at) values (?, ?, ?, ?, ?, ?)',
    id,
    LEARNED,
    button,
    format,
    `code-${id}`,
    NOW,
  );
}

function seed(): void {
  upTo(BEFORE);
  device(BLASTER, 'tuya', 'ir_blaster');
  device(TUYA_REMOTE, 'tuya', 'ir_remote');
  device(SAMSUNG_REMOTE, 'smartthings', 'ir_remote');
  run(
    'insert into ir_remotes (id, blaster_id, name, category, brand, created_at) values (?, ?, ?, ?, ?, ?)',
    LEARNED,
    BLASTER,
    'Lounge TV',
    'tv',
    null,
    NOW,
  );
  code('c1', 'Power', 'pulses');
  code('c2', 'Mute', 'head_key');
  code('c3', 'Volume', 'library');
  run("insert into settings (id, home_name, updated_at) values (1, 'Home', ?)", NOW);
  run(
    'update settings set ir_remotes = ? where id = 1',
    JSON.stringify({ [TUYA_REMOTE]: { on: true }, [SAMSUNG_REMOTE]: { on: false } }),
  );
}

describe('removing the Tuya library remotes', () => {
  it('removes library codes and Tuya remote devices with their state and keeps everything else', () => {
    seed();
    upTo(121);
    expect(column('select id from devices order by id', 'id')).toStrictEqual(
      [SAMSUNG_REMOTE, BLASTER].sort(),
    );
    expect(
      column('select device_id from device_state order by device_id', 'device_id'),
    ).toStrictEqual([SAMSUNG_REMOTE, BLASTER].sort());
    expect(column('select id from ir_codes order by id', 'id')).toStrictEqual(['c1', 'c2']);
    expect(column('select id from ir_remotes', 'id')).toStrictEqual([LEARNED]);
  });

  it('forgets the assumed state of the removed remotes only', () => {
    seed();
    upTo(121);
    const [settings] = rows('select ir_remotes from settings where id = 1');
    expect(JSON.parse(String(settings?.['ir_remotes']))).toStrictEqual({
      [SAMSUNG_REMOTE]: { on: false },
    });
  });

  it('refuses a library code from then on', () => {
    seed();
    upTo(121);
    expect(() => {
      code('c4', 'Again', 'library');
    }).toThrow(/CHECK constraint failed/);
    code('c5', 'Again', 'pulses');
    expect(column('select format from ir_codes order by id', 'format')).toStrictEqual([
      'pulses',
      'head_key',
      'pulses',
    ]);
  });

  it('migrates a home that has no remotes, codes or settings row', () => {
    upTo(BEFORE);
    upTo(121);
    expect(rows('select id from ir_codes')).toStrictEqual([]);
  });
});
