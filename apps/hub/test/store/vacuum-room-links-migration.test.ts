import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { VACUUM_ROOM_LINKS_MIGRATION } from '../../src/store/migrations/vacuum-room-links';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const ROOM = '00000000-0000-4000-8000-000000000001';
const OTHER_ROOM = '00000000-0000-4000-8000-000000000002';
const BEFORE = MIGRATIONS.filter(
  (migration) => migration.version < VACUUM_ROOM_LINKS_MIGRATION.version,
);
const COUNT = z.object({ count: z.number() });

let database: DatabaseSync;

function link(device: string, mapRoomId: number, room: string): void {
  database
    .prepare(
      `insert into vacuum_room_links (device_id, map_room_id, room_id, map_room_name, linked_at)
       values (?, ?, ?, 'Map room', ?)`,
    )
    .run(device, mapRoomId, room, NOW);
}

function links(): number {
  return COUNT.parse(database.prepare('select count(*) as count from vacuum_room_links').get())
    .count;
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, BEFORE, NOW, testLogger());
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
       values ('robot', 'xiaomi', 'robot', 'vacuum', 'Robot', 'm', 'Xiaomi', ?, ?)`,
    )
    .run(NOW, NOW);
  database.prepare(`insert into rooms (id, name, position) values (?, 'Kitchen', 0)`).run(ROOM);
  database.prepare(`insert into rooms (id, name, position) values (?, 'Hall', 1)`).run(OTHER_ROOM);
  migrate(sql, MIGRATIONS, NOW, testLogger());
});

describe('the vacuum room links migration', () => {
  it('takes the next free version after the vacuum storage', () => {
    expect(VACUUM_ROOM_LINKS_MIGRATION.version).toBe(141);
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toContain(VACUUM_ROOM_LINKS_MIGRATION);
  });

  it('keeps one link per map room and one map room per home room on each robot', () => {
    link('robot', 3, ROOM);
    expect(() => {
      link('robot', 3, OTHER_ROOM);
    }).toThrow();
    expect(() => {
      link('robot', 4, ROOM);
    }).toThrow();
    link('robot', 4, OTHER_ROOM);
    expect(links()).toBe(2);
  });

  it('drops the links of a removed home room and of a removed robot', () => {
    link('robot', 3, ROOM);
    link('robot', 4, OTHER_ROOM);
    database.prepare('delete from rooms where id = ?').run(ROOM);
    expect(links()).toBe(1);
    database.prepare('delete from devices where id = ?').run('robot');
    expect(links()).toBe(0);
  });
});
