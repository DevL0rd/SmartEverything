import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PLANNER_COLLABORATION_MIGRATION } from '../../src/store/migrations/planner-collaboration';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-14T10:00:00.000Z';
const OWNER = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0001';
const MEMBER = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0002';
const WORK = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0010';
const GOOGLE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0011';
const EVENT = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0020';
const OVERRIDE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0021';
const TASK = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0022';

const COUNT = z.object({ total: z.number() });
const NAMES = z.object({ name: z.string() });
const FAMILY = z.object({
  id: z.string(),
  profile_id: z.string(),
  name: z.string(),
  colour: z.string(),
  icon: z.string(),
  audience: z.string(),
  source: z.string(),
  feed: z.null(),
});
const ITEM = z.object({
  id: z.string(),
  collection_id: z.string(),
  title: z.string(),
  assignee_id: z.null(),
  ical_uid: z.null(),
  ical_sequence: z.number(),
  created_by: z.string(),
  parent_id: z.string().nullable(),
  series_id: z.string().nullable(),
});

const BEFORE = PLANNER_COLLABORATION_MIGRATION.version - 1;

function before(): { database: DatabaseSync; sql: Sql } {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version <= BEFORE),
    NOW,
    testLogger(),
  );
  return { database, sql };
}

function seed(database: DatabaseSync): void {
  database.exec('delete from profiles');
  const profile = database.prepare(
    'insert into profiles (id, name, colour, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
  );
  profile.run(OWNER, 'Ida', 'amber', 0, NOW, NOW);
  profile.run(MEMBER, 'Sam', 'aqua', 1, NOW, NOW);
  const access = database.prepare(
    `insert into person_access (profile_id, role, template, scopes, conditions, updated_at)
     values (?, ?, ?, '{"areas":[]}', '{}', ?)`,
  );
  access.run(OWNER, 'owner', 'owner', NOW);
  access.run(MEMBER, 'member', 'adult', NOW);
  const collection = database.prepare(
    `insert into planner_collections
     (id, profile_id, kind, name, colour, icon, position, visible, default_reminders, source, google, created_at, updated_at)
     values (?, ?, 'calendar', ?, ?, 'briefcase', ?, 1, '[{"minutes_before":10}]', ?, ?, ?, ?)`,
  );
  collection.run(WORK, OWNER, 'Work', 'work', 3, 'local', null, NOW, NOW);
  collection.run(
    GOOGLE,
    OWNER,
    'Google',
    'home',
    4,
    'google',
    '{"id":"primary","etag":null,"syncToken":null}',
    NOW,
    NOW,
  );
  const item = database.prepare(
    `insert into planner_items
     (id, profile_id, collection_id, kind, parent_id, title, notes, tags, all_day, exdates, start, status,
      position, completion, attachments, reminders, created_by, created_at, updated_at, series_id, original_start)
     values (?, ?, ?, ?, ?, ?, '', '[]', 0, '[]', ?, 'open', 0, '{"kind":"manual"}', '[]', '[]', ?, ?, ?, ?, ?)`,
  );
  item.run(
    EVENT,
    OWNER,
    WORK,
    'event',
    null,
    'Standup',
    '2026-11-16T09:00:00.000Z',
    'person',
    NOW,
    NOW,
    null,
    null,
  );
  item.run(
    OVERRIDE,
    OWNER,
    WORK,
    'event',
    null,
    'Standup',
    '2026-11-17T09:00:00.000Z',
    'google',
    NOW,
    NOW,
    EVENT,
    '2026-11-17T09:00:00',
  );
  item.run(TASK, OWNER, WORK, 'task', EVENT, 'Step', null, 'ai', NOW, NOW, null, null);
  database
    .prepare(
      `insert into planner_occurrences (item_id, occurrence_key, status, completed_at, completed_by)
       values (?, 'single', 'done', ?, 'person')`,
    )
    .run(TASK, NOW);
}

function after(database: DatabaseSync, sql: Sql): void {
  migrate(sql, MIGRATIONS, NOW, testLogger());
  expect(database).toBeDefined();
}

function count(database: DatabaseSync, text: string): number {
  return COUNT.parse(database.prepare(`select count(*) as total from ${text}`).get()).total;
}

describe('the planner collaboration migration', () => {
  it('keeps every collection, item and occurrence and fills the new columns', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    expect(
      count(database, "planner_collections where audience = 'personal' and feed is null"),
    ).toBe(2);
    const items = database
      .prepare('select * from planner_items order by id')
      .all()
      .map((row) => ITEM.parse(row));
    expect(
      items.map((row) => [row.id, row.created_by, row.ical_sequence, row.parent_id, row.series_id]),
    ).toStrictEqual([
      [EVENT, 'person', 0, null, null],
      [OVERRIDE, 'google', 0, null, EVENT],
      [TASK, 'ai', 0, EVENT, null],
    ]);
    expect(count(database, 'planner_occurrences')).toBe(1);
    expect(
      NAMES.parse(
        database.prepare('select source as name from planner_collections where id = ?').get(GOOGLE),
      ).name,
    ).toBe('google');
  });

  it('creates one Family calendar for the first owner after their own calendars', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    const family = database
      .prepare("select * from planner_collections where audience = 'household'")
      .all()
      .map((row) => FAMILY.parse(row));
    expect(family).toHaveLength(1);
    expect(family[0]).toMatchObject({
      profile_id: OWNER,
      name: 'Family',
      colour: 'family',
      icon: 'users',
      source: 'local',
    });
    expect(
      COUNT.parse(
        database
          .prepare('select count(*) as total from planner_collections where position = 5')
          .get(),
      ).total,
    ).toBe(1);
  });

  it('creates no Family calendar when the home has no owner yet and none twice', () => {
    const empty = before();
    empty.database.exec('delete from profiles');
    after(empty.database, empty.sql);
    expect(count(empty.database, "planner_collections where audience = 'household'")).toBe(0);
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    expect(PLANNER_COLLABORATION_MIGRATION.backfill?.(sql, NOW)).toStrictEqual({ created: 0 });
    expect(count(database, "planner_collections where audience = 'household'")).toBe(1);
  });

  it('enforces the rebuilt table rules', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    const insertCollection = (source: string, feed: string | null, kind = 'calendar'): void => {
      database
        .prepare(
          `insert into planner_collections
           (id, profile_id, kind, name, colour, icon, position, visible, default_reminders, audience, source, google, feed, created_at, updated_at)
           values (lower(hex(randomblob(16))), ?, ?, 'X', 'work', 'x', 0, 1, '[]', 'personal', ?, null, ?, ?, ?)`,
        )
        .run(OWNER, kind, source, feed, NOW, NOW);
    };
    insertCollection('feed', '{"kind":"birthdays"}');
    expect(() => {
      insertCollection('feed', null);
    }).toThrow();
    expect(() => {
      insertCollection('local', '{"kind":"birthdays"}');
    }).toThrow();
    expect(() => {
      insertCollection('feed', '{"kind":"birthdays"}', 'list');
    }).toThrow();
    expect(() =>
      database.prepare("update planner_collections set audience = 'public' where id = ?").run(WORK),
    ).toThrow();
  });

  it('lets only a task have an assignee and keeps a UID once per calendar except for overrides', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    database.prepare('update planner_items set assignee_id = ? where id = ?').run(MEMBER, TASK);
    expect(() =>
      database.prepare('update planner_items set assignee_id = ? where id = ?').run(MEMBER, EVENT),
    ).toThrow();
    database.prepare("update planner_items set ical_uid = 'a@x' where id = ?").run(EVENT);
    database.prepare("update planner_items set ical_uid = 'a@x' where id = ?").run(OVERRIDE);
    expect(() =>
      database.prepare("update planner_items set ical_uid = 'a@x' where id = ?").run(TASK),
    ).toThrow();
    expect(() =>
      database.prepare("update planner_items set created_by = 'guest' where id = ?").run(EVENT),
    ).toThrow();
    for (const creator of ['booking', 'feed']) {
      database.prepare('update planner_items set created_by = ? where id = ?').run(creator, EVENT);
    }
    database.prepare('delete from profiles where id = ?').run(MEMBER);
    expect(
      COUNT.parse(
        database
          .prepare('select count(*) as total from planner_items where assignee_id is null')
          .get(),
      ).total,
    ).toBe(3);
  });

  it('cascades shares, guests, export links and booking pages from their collection and item', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    database
      .prepare(
        "insert into planner_collection_shares (collection_id, profile_id, role, colour, visible, created_at) values (?, ?, 'edit', null, 1, ?)",
      )
      .run(WORK, MEMBER, NOW);
    database
      .prepare(
        `insert into planner_guests (id, item_id, kind, profile_id, email, name, token_hash, response, note, delivery, delivery_detail, invited_at, responded_at)
         values ('g1', ?, 'email', null, 'a@b.co', null, ?, 'needs_action', null, 'sent', null, ?, null)`,
      )
      .run(EVENT, 'a'.repeat(64), NOW);
    database
      .prepare(
        'insert into planner_export_links (collection_id, token, created_at) values (?, ?, ?)',
      )
      .run(WORK, 'T'.repeat(43), NOW);
    database
      .prepare(
        `insert into planner_booking_pages
         (id, profile_id, collection_id, title, description, minutes, availability, buffer_before, buffer_after, notice_minutes, ahead_days, location, enabled, token, created_at, updated_at)
         values ('b1', ?, ?, 'Call', '', 30, '[]', 0, 0, 0, 14, null, 1, ?, ?, ?)`,
      )
      .run(OWNER, WORK, 'B'.repeat(43), NOW, NOW);
    database.prepare('delete from planner_items where id = ?').run(EVENT);
    expect(count(database, 'planner_guests')).toBe(0);
    database.prepare('delete from planner_collections where id = ?').run(WORK);
    for (const table of [
      'planner_collection_shares',
      'planner_export_links',
      'planner_booking_pages',
    ]) {
      expect(count(database, table), table).toBe(0);
    }
  });

  it('keeps guest rows consistent: kinds, delivery, answers and one guest per person and address', () => {
    const { database, sql } = before();
    seed(database);
    after(database, sql);
    const guest = database.prepare(
      `insert into planner_guests (id, item_id, kind, profile_id, email, name, token_hash, response, note, delivery, delivery_detail, invited_at, responded_at)
       values (?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?)`,
    );
    const hash = 'c'.repeat(64);
    guest.run(
      'p1',
      EVENT,
      'person',
      MEMBER,
      null,
      null,
      'needs_action',
      'not_sent',
      null,
      NOW,
      null,
    );
    expect(() =>
      guest.run(
        'p2',
        EVENT,
        'person',
        MEMBER,
        null,
        null,
        'needs_action',
        'not_sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    expect(() =>
      guest.run('p3', EVENT, 'person', OWNER, null, null, 'needs_action', 'sent', null, NOW, null),
    ).toThrow();
    expect(() =>
      guest.run(
        'p4',
        EVENT,
        'person',
        OWNER,
        'a@b.co',
        null,
        'needs_action',
        'not_sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    guest.run('e1', EVENT, 'email', null, 'Sam@Example.com', hash, 'yes', 'sent', null, NOW, NOW);
    expect(() =>
      guest.run(
        'e2',
        EVENT,
        'email',
        null,
        'sam@example.com',
        'd'.repeat(64),
        'needs_action',
        'sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    expect(() =>
      guest.run(
        'e3',
        EVENT,
        'email',
        null,
        'x@example.com',
        hash,
        'needs_action',
        'sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    expect(() =>
      guest.run(
        'e4',
        EVENT,
        'email',
        null,
        'y@example.com',
        null,
        'needs_action',
        'sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    expect(() =>
      guest.run(
        'e5',
        EVENT,
        'email',
        null,
        'z@example.com',
        'e'.repeat(64),
        'needs_action',
        'failed',
        null,
        NOW,
        null,
      ),
    ).toThrow();
    expect(() =>
      guest.run(
        'e6',
        EVENT,
        'email',
        null,
        'w@example.com',
        'f'.repeat(64),
        'yes',
        'sent',
        null,
        NOW,
        null,
      ),
    ).toThrow();
  });

  it('keeps the mail log without clear addresses and with a reason for a failure', () => {
    const { database, sql } = before();
    after(database, sql);
    const log = database.prepare(
      'insert into mail_log (id, kind, to_hash, subject, outcome, detail, at) values (?, ?, ?, ?, ?, ?, ?)',
    );
    log.run('m1', 'invite', 'a'.repeat(64), 'Invitation', 'sent', null, NOW);
    expect(() => log.run('m2', 'invite', 'a@b.co', 'Invitation', 'sent', null, NOW)).toThrow();
    expect(() =>
      log.run('m3', 'invite', 'a'.repeat(64), 'Invitation', 'failed', null, NOW),
    ).toThrow();
    expect(() => log.run('m4', 'spam', 'a'.repeat(64), 'Invitation', 'sent', null, NOW)).toThrow();
  });

  it('is the migration after the clock migration and adds the new tables', () => {
    const numbers = MIGRATIONS.map((migration) => migration.version);
    expect(numbers).toContain(PLANNER_COLLABORATION_MIGRATION.version);
    expect(new Set(numbers).size).toBe(numbers.length);
    const { database, sql } = before();
    after(database, sql);
    const names = database
      .prepare(
        `select name from sqlite_master where type = 'table'
         and name in ('planner_collection_shares', 'planner_guests', 'planner_export_links', 'planner_booking_pages', 'mail_log')
         order by name`,
      )
      .all()
      .map((row) => NAMES.parse(row).name);
    expect(names).toStrictEqual([
      'mail_log',
      'planner_booking_pages',
      'planner_collection_shares',
      'planner_export_links',
      'planner_guests',
    ]);
  });
});
