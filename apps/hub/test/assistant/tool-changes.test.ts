import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubTool, ToolSource } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { ToolChanges } from '../../src/assistant/tool-changes';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let tools: HubTool[];
let changed: (() => void)[];
let hub: ToolHub;

function tool(name: string, plugin: string | null): HubTool {
  return {
    name,
    title: plugin === null ? name : `${plugin}: ${name}`,
    description: name,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    origin: plugin === null ? { kind: 'se' } : { kind: 'plugin', pluginId: plugin },
    humanOnly: false,
  };
}

beforeEach(async () => {
  captureLogs();
  vi.useFakeTimers({ now: Date.parse('2026-10-10T08:00:00.000Z') });
  opened = await testStore(() => new Date());
  tools = [tool('get_weather', null)];
  changed = [];
  const source: ToolSource = {
    tools: () => tools,
    call: () => Promise.resolve({ response: {}, line: '', pictures: [] }),
    validate: () => null,
    changes: (listener) => {
      changed.push(listener);
      return (): void => undefined;
    },
  };
  hub = new ToolHub([source]);
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

describe('tool changes', () => {
  it('notes added and removed tools once in every active chat, after the changes settle', () => {
    const { store } = opened;
    const client = store.clients.create(
      { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
      true,
    );
    const owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' as const };
    const now = (): Date => new Date();
    const files = new AssistantFiles({
      dataDirectory: opened.directory,
      chat: store.assistantChat,
      now,
    });
    const chat = new ChatDirectory(store, files, now).create(owner, { engine: DEFAULT_ENGINE });
    new ToolChanges({
      store,
      conversation: new ConversationLog(store),
      now,
      log: testLogger('assistant'),
    }).attach(hub);
    expect(store.assistantChat.messages({ chatId: chat.id, limit: 10 })).toHaveLength(0);
    const activeAt = store.aiChats.chat(chat.id).last_message_at;
    tools = [tool('router_status', 'Router'), tool('router_reboot', 'Router')];
    changed.forEach((listener) => {
      listener();
    });
    changed.forEach((listener) => {
      listener();
    });
    vi.advanceTimersByTime(2000);
    const rows = store.assistantChat.messages({ chatId: chat.id, limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(
      'Tools updated: +2 Router tools, −1 tool (+router_reboot, +router_status, −get_weather)',
    );
    expect(rows[0]?.embeds).toEqual([
      {
        kind: 'tools_changed',
        added: ['router_reboot', 'router_status'],
        removed: ['get_weather'],
      },
    ]);
    expect(store.aiChats.chat(chat.id).last_message_at).toBe(activeAt);
  });
});
