import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AI_REPAIR_CHAT_MIGRATION } from '../../src/store/migrations/ai-repair-chat';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-08T10:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CHAT = '0e000000-0000-4000-8000-0000000000c1';
const EVENT = '0e000000-0000-4000-8000-0000000000a1';
const NOTE = '0e000000-0000-4000-8000-0000000000a2';
const OTHER = '0e000000-0000-4000-8000-0000000000a3';
const FINGERPRINT = 'f'.repeat(64);
const REVISION = 'a'.repeat(40);
const PATH = 'apps/hub/src/example.ts';

function seed(database: DatabaseSync): void {
  database
    .prepare(
      "insert into profiles(id,name,colour,fitness_goals,position,created_at,updated_at) values(?,'Owner','amber','{}',0,?,?)",
    )
    .run(PROFILE, NOW, NOW);
  database
    .prepare(
      "insert into ai_chats(id,profile_id,kind,title,engine,pinned,created_at,updated_at) values(?,?,'chat','Work','{}',0,?,?)",
    )
    .run(CHAT, PROFILE, NOW, NOW);
  const add = database.prepare(
    "insert into assistant_messages(id,profile_id,chat_id,role,kind,author,text,attachments,embeds,created_at,updated_at) values(?,?,?,'system','update',?,?,'[]','[]',?,?)",
  );
  add.run(
    NOTE,
    PROFILE,
    CHAT,
    'AI repair',
    'Full diagnosis\n\n**Evidence** remains intact.',
    NOW,
    NOW,
  );
  add.run(OTHER, PROFILE, CHAT, 'Hub update', 'Update complete', NOW, NOW);
  const work = {
    evidence: { category: 'hub service failed' },
    patch: {
      provider: 'openrouter',
      revision: REVISION,
      sources: [{ path: PATH, digest: 'b'.repeat(64), text: 'source' }],
    },
  };
  database
    .prepare(
      "insert into assistant_events(id,kind,chat_id,message_id,profile_id,client_id,text,received_at) values(?,'wake',?,null,?,null,?,?)",
    )
    .run(EVENT, CHAT, PROFILE, JSON.stringify(work), NOW);
  const authority = {
    event_id: EVENT,
    profile_id: PROFILE,
    client_id: null,
    kind: 'service',
    role: 'member',
    tools: [],
    hub_os_ban: true,
    plugin_id: null,
    requester: null,
    repair_root: EVENT,
  };
  database
    .prepare('insert into harness_authorities(event_id,authority) values(?,?)')
    .run(EVENT, JSON.stringify(authority));
  database
    .prepare(
      "insert into ai_repair_groups(fingerprint,component,event,first_at,last_at,observations,automatic_admitted,admission) values(?,'hub.service','service.fatal',?,?,1,1,?)",
    )
    .run(FINGERPRINT, NOW, NOW, JSON.stringify({ kind: 'queued', eventId: EVENT, chatId: CHAT }));
}

describe('repair chat migration', () => {
  it('preserves historical content and restricted authority while retiring isolated work once', () => {
    const database = new DatabaseSync(':memory:');
    try {
      const sql = new Sql(database);
      migrate(
        sql,
        MIGRATIONS.filter(({ version }) => version < AI_REPAIR_CHAT_MIGRATION.version),
        NOW,
        testLogger(),
      );
      seed(database);
      migrate(sql, MIGRATIONS, NOW, testLogger());
      expect(
        database.prepare('select role,kind,text from assistant_messages where id=?').get(NOTE),
      ).toMatchObject({
        role: 'responder',
        kind: 'text',
        text: 'Full diagnosis\n\n**Evidence** remains intact.',
      });
      expect(
        database.prepare('select role,kind,text from assistant_messages where id=?').get(OTHER),
      ).toMatchObject({ role: 'system', kind: 'update', text: 'Update complete' });
      expect(
        database.prepare('select answered_at from assistant_events where id=?').get(EVENT),
      ).toMatchObject({ answered_at: NOW });
      expect(
        database.prepare('select state,reason_code from assistant_messages where id=?').get(EVENT),
      ).toMatchObject({ state: 'failed', reason_code: 'interrupted' });
      expect(
        database
          .prepare('select failed_event_id from ai_repair_groups where fingerprint=?')
          .get(FINGERPRINT),
      ).toMatchObject({ failed_event_id: EVENT });
      expect(
        database
          .prepare(
            "select json_extract(authority,'$.role') role,json_extract(authority,'$.kind') kind,json_extract(authority,'$.tools') tools,json_extract(authority,'$.repair_origin') origin,json_type(authority,'$.repair_root') old,json_extract(authority,'$.hub_os_ban') ban from harness_authorities where event_id=?",
          )
          .get(EVENT),
      ).toMatchObject({
        role: 'member',
        kind: 'service',
        tools: '[]',
        origin: EVENT,
        old: null,
        ban: 1,
      });
      expect(
        database
          .prepare('select approval from ai_repair_source_approvals where event_id=?')
          .get(EVENT),
      ).toMatchObject({ approval: JSON.stringify({ revision: REVISION, paths: [PATH] }) });
      migrate(sql, MIGRATIONS, NOW, testLogger());
      expect(
        database.prepare('select count(*) count from assistant_messages where id=?').get(EVENT),
      ).toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });
});
