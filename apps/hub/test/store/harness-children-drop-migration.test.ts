import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HARNESS_CHILDREN_DROP_MIGRATION } from '../../src/store/migrations/harness-children-drop';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-25T05:00:00.000Z';
const RUN = z.object({ id: z.string(), projection: z.string() });
const TABLE = z.object({ name: z.string() });

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-children-drop-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seededCopy(): DatabaseSync {
  const database = new DatabaseSync(join(directory, 'hub.db'));
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < HARNESS_CHILDREN_DROP_MIGRATION.version),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles(id,name,colour,created_at,updated_at) values('profile','Ann','amber',?,?)",
    )
    .run(NOW, NOW);
  const insertChat = database.prepare(
    "insert into ai_chats(id,profile_id,kind,title,engine,pinned,created_at,updated_at) values(?,'profile','chat','Chat','{}',0,?,?)",
  );
  const insertSession = database.prepare(
    "insert into dsh_sessions(session_id,chat_id,profile_id,header,inherited_event_count,created_at) values(?,?,'profile','{}',0,?)",
  );
  for (const [chat, session] of [
    ['chat', 'parent'],
    ['child-chat', 'child'],
  ] as const) {
    insertChat.run(chat, NOW, NOW);
    insertSession.run(session, chat, NOW);
  }
  const insertRun = database.prepare(
    'insert into ai_agent_runs(id,parent_chat_id,profile_id,source_identity,state,source_seq,source_revision,projection,updated_at) values(?,?,?,?,?,?,?,?,?)',
  );
  const harness = {
    session_id: 'session',
    parent_session_id: 'parent',
    writer_epoch: 3,
    operation_id: 'op',
    parent_delivery_id: 'delivery',
  };
  insertRun.run(
    'native',
    'chat',
    'profile',
    'a',
    'running',
    1,
    0,
    JSON.stringify({ harness }),
    NOW,
  );
  insertRun.run(
    'plain',
    'chat',
    'profile',
    'b',
    'running',
    1,
    0,
    JSON.stringify({ title: 'x' }),
    NOW,
  );
  database
    .prepare(
      "insert into harness_children(operation_id,parent_session,child_session,run_id,delivery_id,state,result,delivered) values('op','parent','child','native','delivery','running',null,0)",
    )
    .run();
  return database;
}

describe('dropping the native child lineage table', () => {
  it('drops the table and removes the two lineage ids from stored runs on a copy of the schema', () => {
    const database = seededCopy();

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    const tables = database
      .prepare("select name from sqlite_master where type='table' and name='harness_children'")
      .all()
      .map((row) => TABLE.parse(row));
    expect(tables).toStrictEqual([]);
    const runs = database
      .prepare('select id, projection from ai_agent_runs order by id')
      .all()
      .map((row) => RUN.parse(row))
      .map((row) => [row.id, JSON_VALUE.parse(JSON.parse(row.projection))]);
    expect(runs).toStrictEqual([
      [
        'native',
        { harness: { session_id: 'session', parent_session_id: 'parent', writer_epoch: 3 } },
      ],
      ['plain', { title: 'x' }],
    ]);
  });
});
