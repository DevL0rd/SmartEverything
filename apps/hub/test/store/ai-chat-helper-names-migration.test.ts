import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { AI_CHAT_HELPER_NAMES_MIGRATION } from '../../src/store/migrations/ai-chat-helper-names';

it('backfills deterministic helper labels without changing titles or timestamps', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`
      create table ai_chats (
        id text primary key, kind text not null, parent_id text, title text not null,
        created_at text not null, updated_at text not null
      ) strict;
      insert into ai_chats values
        ('first', 'chat', null, 'Parent', '1', '2'),
        ('z', 'subagent', 'first', 'Same task', '1', '2'),
        ('a', 'subagent', 'first', 'Same task', '1', '2'),
        ('b', 'subagent', 'first', 'Older task', '0', '2'),
        ('branch', 'chat', 'first', 'Branch', '1', '2'),
        ('second', 'chat', null, 'Other parent', '1', '2'),
        ('solo', 'subagent', 'second', 'Other helper', '1', '2'),
        ('orphan', 'subagent', null, 'Orphan', '1', '2');
    `);
    const before = database.prepare('select * from ai_chats order by id').all();
    for (const statement of AI_CHAT_HELPER_NAMES_MIGRATION.statements) database.exec(statement);
    const after = database.prepare('select * from ai_chats order by id').all();
    expect(after.map(({ helper_name }) => helper_name)).toEqual([
      'Helper 2',
      'Helper 1',
      null,
      null,
      'Helper',
      null,
      'Helper 1',
      'Helper 3',
    ]);
    expect(after.map(({ helper_name: _name, ...row }) => row)).toEqual(before);
    database.exec("delete from ai_chats where id = 'b'");
    expect(database.prepare("select helper_name from ai_chats where id = 'a'").get()).toEqual({
      helper_name: 'Helper 2',
    });
  } finally {
    database.close();
  }
});
