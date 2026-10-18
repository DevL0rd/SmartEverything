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
const VERSION = MIGRATIONS.find((migration) => migration.name === 'provider_rooms')?.version ?? 0;
const BEFORE = VERSION - 1;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-provider-rooms-'));
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

function rows(sql: string): Record<string, unknown>[] {
  return ROWS.parse(database.prepare(sql).all());
}

function room(id: string, name: string, position: number): void {
  database
    .prepare('insert into rooms (id, name, position) values (?, ?, ?)')
    .run(id, name, position);
}

function device(id: string, providerRoom: string | null, roomId: string | null): void {
  database
    .prepare(
      "insert into devices (id, provider, external_id, kind, name, model, manufacturer, provider_room, room_id, created_at, updated_at) values (?, 'xiaomi', ?, 'light', 'Lamp', 'm', 'v', ?, ?, ?, ?)",
    )
    .run(id, id, providerRoom, roomId, NOW, NOW);
}

describe('provider rooms migration', () => {
  it('creates the missing rooms, reuses existing ones and leaves placed devices alone', () => {
    upTo(BEFORE);
    room('r-study', 'Study', 0);
    room('r-hall', 'Hall', 4);
    device('a', 'Kitchen', null);
    device('b', ' kitchen', null);
    device('c', 'study', null);
    device('d', 'Kitchen', 'r-hall');
    device('e', null, null);
    device('f', '', null);
    upTo(VERSION);
    const placed = new Map(
      rows('select id, room_id from devices').map((row) => [row['id'], row['room_id']] as const),
    );
    const kitchen = rows("select id, position from rooms where name = 'Kitchen'");
    expect(kitchen).toHaveLength(1);
    expect(kitchen[0]?.['position']).toBe(5);
    expect(placed.get('a')).toBe(kitchen[0]?.['id']);
    expect(placed.get('b')).toBe(kitchen[0]?.['id']);
    expect(placed.get('c')).toBe('r-study');
    expect(placed.get('d')).toBe('r-hall');
    expect(placed.get('e')).toBeNull();
    expect(placed.get('f')).toBeNull();
    expect(rows('select name from rooms order by name').map((row) => row['name'])).toStrictEqual([
      'Hall',
      'Kitchen',
      'Study',
    ]);
  });
});
