import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { TOOL_SCHEME_MIGRATION } from '../../src/store/migrations/tool-scheme';
import { currentCall, currentGrantNames } from '../../src/store/migrations/tool-scheme-calls';
import { rewritten } from '../../src/store/migrations/tool-scheme-rewrite';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-21T08:00:00.000Z';
const PERSON = '7e000000-0000-4000-8000-000000000001';
const CHAT = '7e000000-0000-4000-8000-000000000002';
const SCHEDULE = '7e000000-0000-4000-8000-000000000003';
const MESSAGE = '7e000000-0000-4000-8000-000000000004';
const DEVICE = '7e000000-0000-4000-8000-000000000005';
const BEFORE = MIGRATIONS.filter((migration) => migration.version < TOOL_SCHEME_MIGRATION.version);

const TEXT = z.object({ text: z.string() });
const COUNT = z.object({ count: z.number() });

function open(): { database: DatabaseSync; sql: Sql } {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, BEFORE, NOW, testLogger());
  return { database, sql };
}

function text(database: DatabaseSync, query: string): unknown {
  return JSON.parse(TEXT.parse(database.prepare(query).get()).text);
}

function seed(database: DatabaseSync): void {
  database.exec(`insert into profiles (id, name, colour, created_at, updated_at)
    values ('${PERSON}', 'Sam', 'aqua', '${NOW}', '${NOW}')`);
  database.exec(`insert into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`);
  database.exec(
    `update settings set mcp_disabled_tools = '["list_people","update_settings","computer_apps","gone_tool","router__list_clients"]'`,
  );
  database.exec(
    `insert into ai_settings (key, settings, updated_at) values ('tool_set', '{"names":["get_home"]}', '${NOW}')`,
  );
  database.exec(`insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at, tools)
    values ('${CHAT}', '${PERSON}', 'chat', 'Chat', '{"kind":"openrouter","model":null,"effort":null}', 0, '${NOW}', '${NOW}', '["find_devices","edit_automation","see"]')`);
  const steps = JSON.stringify([
    { kind: 'tool', tool: 'call_person', args: { profileId: PERSON, reason: 'Dinner' } },
    { kind: 'tool', tool: 'update_settings', args: { action: 'weather' } },
    { kind: 'wait', seconds: 5 },
  ]);
  database.exec(`insert into scheduled_actions (id, profile_id, via, state, created_at, updated_at, steps)
    values ('${SCHEDULE}', '${PERSON}', 'assistant', 'scheduled', '${NOW}', '${NOW}', '${steps}')`);
  database.exec(`insert into assistant_messages (id, profile_id, role, kind, author, text, created_at, updated_at, steps)
    values ('${MESSAGE}', '${PERSON}', 'responder', 'text', 'MoMo', 'Done', '${NOW}', '${NOW}', '["find_devices","Bash","see"]')`);
}

describe('the tool scheme migration', () => {
  it('takes the next free number after the latest earlier migration', () => {
    expect(TOOL_SCHEME_MIGRATION.version).toBe(
      Math.max(...BEFORE.map((migration) => migration.version)) + 1,
    );
  });

  it('moves switched-off tools, chat grants, scheduled calls and message steps to the current tools', () => {
    const { database, sql } = open();
    seed(database);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(text(database, 'select mcp_disabled_tools as text from settings')).toStrictEqual([
      'person_read',
      'settings_edit',
      'settings_sync',
      'router__list_clients',
    ]);
    expect(text(database, `select tools as text from ai_chats where id = '${CHAT}'`)).toStrictEqual(
      ['device_find', 'automation_edit', 'secret_edit', 'sight_look'],
    );
    expect(
      text(database, `select steps as text from scheduled_actions where id = '${SCHEDULE}'`),
    ).toStrictEqual([
      {
        kind: 'tool',
        tool: 'call_start',
        args: { personId: PERSON, reason: 'Dinner', action: 'ring' },
      },
      { kind: 'tool', tool: 'settings_sync', args: { action: 'weather' } },
      { kind: 'wait', seconds: 5 },
    ]);
    expect(
      text(database, `select steps as text from assistant_messages where id = '${MESSAGE}'`),
    ).toStrictEqual(['device_find', 'Bash', 'sight_look']);
    expect(
      COUNT.parse(
        database.prepare("select count(*) as count from ai_settings where key = 'tool_set'").get(),
      ).count,
    ).toBe(0);
  });
});

describe('a stored tool call', () => {
  it('moves a renamed tool with its arguments, and splits by action where the tool was split', () => {
    expect(
      currentCall({ tool: 'edit_automation', args: { action: 'set_secret', name: 'k' } }),
    ).toStrictEqual({
      tool: 'secret_edit',
      args: { action: 'set', name: 'k' },
    });
    expect(
      currentCall({ tool: 'edit_device', args: { action: 'device', deviceId: DEVICE } }),
    ).toStrictEqual({
      tool: 'device_edit',
      args: { action: 'update', deviceId: DEVICE },
    });
    expect(currentCall({ tool: 'router__list_clients', args: {} })).toBeNull();
  });

  it('keeps what clear_preview_data cleared as the target of preview_edit clear_data', () => {
    expect(
      currentCall({ tool: 'clear_preview_data', args: { chatId: CHAT, action: 'clear-cookies' } }),
    ).toStrictEqual({
      tool: 'preview_edit',
      args: { chatId: CHAT, target: 'cookies', action: 'clear_data' },
    });
  });

  it('grants a merged tool to nothing rather than widen a grant to its new home', () => {
    expect(currentGrantNames('computer_apps')).toStrictEqual([]);
    expect(currentGrantNames('get_home')).toStrictEqual(['home_read']);
  });

  it('rewrites an automation tool.call node with literal ports, in programs and compiled plans alike', () => {
    const node = {
      kind: 'tool.call',
      ports: {
        tool: { lit: 'speak' },
        person: { lit: PERSON },
        args: { lit: { target: { kind: 'device', deviceId: DEVICE }, text: 'Hi' } },
      },
    };
    const result = rewritten({ body: { nodes: [node] } }, currentCall);
    expect(result.calls).toBe(1);
    expect(result.left).toStrictEqual([]);
    expect(result.value).toStrictEqual({
      body: { nodes: [{ ...node, ports: { ...node.ports, tool: { lit: 'voice_speak' } } }] },
    });
  });

  it('reports a call whose arguments are wired when the move must change them', () => {
    const node = {
      kind: 'tool.call',
      ports: { tool: { lit: 'call_person' }, args: { wire: { from: 'build', port: 'value' } } },
    };
    expect(rewritten(node, currentCall).left).toStrictEqual(['call_person with wired arguments']);
  });
});
