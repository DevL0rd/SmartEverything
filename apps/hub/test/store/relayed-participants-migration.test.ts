import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { RELAYED_PARTICIPANTS_MIGRATION } from '../../src/store/migrations/relayed-participants';

const HELPER_EMBED = (direction: string): string =>
  JSON.stringify([
    { kind: 'helper_dialogue', direction, helper_chat_id: 'helper', helper_name: 'Nova' },
  ]);

function seed(database: DatabaseSync): void {
  database.exec(`
    create table ai_chats (id text primary key, helper_name text);
    create table assistant_settings (id integer primary key, settings text not null);
    create table assistant_events (id text primary key, message_id text, report_to text);
    create table assistant_messages (
      id text primary key, chat_id text not null, author text not null,
      origin text, embeds text not null default '[]'
    );
    insert into ai_chats values ('parent', null), ('helper', 'Nova'), ('plain', null);
    insert into assistant_settings values (1, '{"name":"Ada"}');
  `);
  const row = database.prepare('insert into assistant_messages values (?, ?, ?, ?, ?)');
  const chat = (name: string): string => JSON.stringify({ source: 'chat', name, hops: 1 });
  const helper = (name: string): string => JSON.stringify({ source: 'subagent', name });
  row.run('asked', 'plain', 'Planner', chat('Planner'), '[]');
  row.run(
    'reply',
    'parent',
    'Check the data',
    helper('Check the data'),
    HELPER_EMBED('from_helper'),
  );
  row.run('ask', 'parent', 'Planner', chat('Planner'), HELPER_EMBED('to_helper'));
  row.run('service', 'plain', 'Bridge', chat('Bridge'), '[]');
  row.run('own', 'plain', 'Pat', JSON.stringify({ source: 'app', name: null }), '[]');
  database.exec(`insert into assistant_events values ('e1', 'asked', 'helper')`);
}

it('rewrites relayed rows to the participant and records the source chat once', () => {
  const database = new DatabaseSync(':memory:');
  try {
    seed(database);
    for (const statement of RELAYED_PARTICIPANTS_MIGRATION.statements) database.exec(statement);
    const rows = database
      .prepare(
        `select id, author, json_extract(origin, '$.chat_id') as chat, json_extract(origin, '$.name') as name
         from assistant_messages order by id`,
      )
      .all();
    expect(rows).toEqual([
      { id: 'ask', author: 'Ada', chat: 'parent', name: 'Planner' },
      { id: 'asked', author: 'Nova', chat: 'helper', name: 'Planner' },
      { id: 'own', author: 'Pat', chat: null, name: null },
      { id: 'reply', author: 'Nova', chat: 'helper', name: 'Check the data' },
      { id: 'service', author: 'Bridge', chat: null, name: 'Bridge' },
    ]);
    for (const statement of RELAYED_PARTICIPANTS_MIGRATION.statements) database.exec(statement);
    expect(database.prepare('select count(*) as n from assistant_messages').get()).toEqual({
      n: 5,
    });
  } finally {
    database.close();
  }
});
