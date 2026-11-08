import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import type { NewChat } from '../../src/store/repositories/ai-chat-input';
import { openStore } from '../../src/store/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-05T00:00:00.000Z';
const MORE_THAN_THE_NAME_POOL = 17;

const CODEX_ENGINE: Engine = {
  kind: 'codex',
  device_id: CLAUDE_TEST_ENGINE.device_id,
  model: 'gpt-5.2',
  effort: null,
  settings: {},
};

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
});

afterEach(async () => {
  await opened.close();
});

function chat(
  kind: NewChat['kind'],
  parentId: string | null,
  engine: Engine = TEST_ENGINE,
): AiChatRow {
  const { store } = opened;
  return store.aiChats.create({
    profileId: store.profiles.first().id,
    kind,
    title: 'Same task title',
    icon: null,
    parentId,
    sourceKey: null,
    engine,
  });
}

it('keeps distinct helper names separate from task titles and engine families across reloads', () => {
  const parent = chat('chat', null);
  const branch = chat('chat', parent.id);
  const helpers = [TEST_ENGINE, CLAUDE_TEST_ENGINE, CODEX_ENGINE].map((engine) =>
    chat('subagent', parent.id, engine),
  );
  expect(parent.helper_name).toBeNull();
  expect(branch.helper_name).toBeNull();
  expect(new Set(helpers.map((helper) => helper.helper_name)).size).toBe(helpers.length);
  for (const helper of helpers) {
    expect(helper.helper_name).toMatch(/^[A-Z][a-z]+$/u);
    expect(helper.title).toBe('Same task title');
    opened.store.aiChats.update(helper.id, { title: 'Renamed task' });
  }

  const again = openStore({
    path: join(opened.directory, 'test.db'),
    log: testLogger('store'),
    now: () => new Date(NOW),
    systemTimeZone: 'UTC',
  });
  try {
    for (const helper of helpers) {
      expect(again.aiChats.chat(helper.id)).toMatchObject({
        helper_name: helper.helper_name,
        title: 'Renamed task',
      });
    }
  } finally {
    again.close();
  }
});

it('assigns a distinct name when every base name is already in use', () => {
  const parent = chat('chat', null);
  const helpers = Array.from({ length: MORE_THAN_THE_NAME_POOL }, () =>
    chat('subagent', parent.id),
  );
  const names = helpers.map((helper) => helper.helper_name);
  expect(new Set(names).size).toBe(helpers.length);
  expect(names.at(-1)).toMatch(/^[A-Z][a-z]+ 2$/u);
});

it('enforces case-insensitive sibling uniqueness in the store', () => {
  const parent = chat('chat', null);
  const child = chat('subagent', parent.id);
  const sibling = chat('subagent', parent.id);
  const other = chat('subagent', chat('chat', null).id);
  const database = new DatabaseSync(join(opened.directory, 'test.db'));
  try {
    const rename = database.prepare(
      'update ai_chats set helper_name = (select lower(helper_name) from ai_chats where id = ?) where id = ?',
    );
    expect(() => rename.run(child.id, sibling.id)).toThrow(/UNIQUE constraint failed/u);
    expect(rename.run(child.id, other.id).changes).toBe(1);
  } finally {
    database.close();
  }
});
