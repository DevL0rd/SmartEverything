import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DROP_PREVIEWS_MIGRATION } from '../../src/store/migrations/drop-previews';
import { Sql } from '../../src/store/sql';

const TEXT = z.object({ text: z.string() });
const NAME = z.object({ name: z.string() });

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table settings (id integer primary key, mcp_disabled_tools text not null);
    create table ai_chats (id text primary key, tools text);
    create table ai_preview_projects (id text primary key);
    create table preview_error_rules (id text primary key);
    insert into settings values (1, '["preview_edit","device_control","preview_capture"]');
    insert into ai_chats values ('a', '["browser_control","preview_read","preview_logs_read"]');
    insert into ai_chats values ('b', null);
    insert into ai_preview_projects values ('p');`);
  return db;
}

describe('migration 138 drops the publication system', () => {
  it('drops the preview tables and the removed tool names, keeping everything else', () => {
    const db = database();
    for (const statement of DROP_PREVIEWS_MIGRATION.statements) db.exec(statement);
    DROP_PREVIEWS_MIGRATION.backfill?.(new Sql(db), '2026-10-21T00:00:00.000Z');
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row) => NAME.parse(row).name);
    expect(tables).toStrictEqual(['ai_chats', 'settings']);
    const disabled = TEXT.parse(db.prepare('select mcp_disabled_tools as text from settings').get());
    expect(JSON.parse(disabled.text)).toStrictEqual(['device_control']);
    const grant = TEXT.parse(db.prepare("select tools as text from ai_chats where id = 'a'").get());
    expect(JSON.parse(grant.text)).toStrictEqual(['browser_control']);
  });
});
