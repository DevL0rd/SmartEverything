import { DEFAULT_ENGINE, chatWidgetsOf, type AssistantMessageRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubTool, ToolCaller, ToolSource } from '../src/ai-tools/hub-tool';
import { ToolHub } from '../src/ai-tools/tool-hub';
import { startChatWidgets } from '../src/chat-widgets/start';
import { McpCallFeed } from '../src/extensions/mcp/call-feed';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const SET_POWER: HubTool = {
  name: 'set_power',
  title: 'Power',
  description: 'Turn a device on or off',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
  confirms: (): boolean => false,
};

const POWER: ToolSource = {
  tools: () => [SET_POWER],
  validate: () => null,
  changes: () => () => undefined,
  call: () => Promise.resolve({ response: { result: 'done' }, line: 'Turned on', pictures: [] }),
};

let opened: TestStore;
let tools: ToolHub;
let stop: () => void;
let chatId: string;
let caller: ToolCaller;
let lamp: string;
let calls: McpCallFeed;

function message(
  role: 'person' | 'responder',
  state: 'working' | null,
  inChat: string = chatId,
): AssistantMessageRow {
  return opened.store.assistantChat.addMessage({
    profile_id: caller.profileId,
    client_id: null,
    role,
    kind: 'text',
    author: role === 'person' ? 'Sam' : 'Coordinator',
    text: '',
    attachments: [],
    state,
    reason: null,
    steps: [],
    reply_to: null,
    chat_id: inChat,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  });
}

function widgetsOn(id: string): unknown[] {
  return chatWidgetsOf(opened.store.assistantChat.message(id).embeds);
}

function workerChat(title: string): string {
  return opened.store.aiChats.create({
    profileId: caller.profileId,
    kind: 'chat',
    title,
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: { ...DEFAULT_ENGINE, kind: 'claude-session' },
  }).id;
}

const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  opened = await testStore();
  const profileId = opened.store.profiles.first().id;
  chatId = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  }).id;
  caller = { profileId, role: 'owner', chatId, via: 'chat', confirmed: false, clientId: null };
  const [device] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId: 'lamp-1',
      parentId: null,
      kind: 'light',
      name: 'Lamp',
      model: 'lamp',
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  lamp = device?.id ?? '';
  tools = new ToolHub([POWER]);
  calls = new McpCallFeed();
  stop = startChatWidgets({
    store: opened.store,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    tools,
    context: { toolCalls: calls },
    log: testLogger('hub'),
  });
});

afterEach(async () => {
  stop();
  await opened.close();
});

describe('chat widgets', () => {
  it('puts the device widget under the reply being written', async () => {
    const reply = message('responder', 'working');
    await tools.call('set_power', { deviceId: lamp, on: true }, caller);
    expect(widgetsOn(reply.id)).toEqual([{ kind: 'device', id: lamp }]);
  });

  it('holds widgets until the reply arrives, for backends that reply at the end', async () => {
    await tools.call('set_power', { deviceId: lamp, on: true }, caller);
    const reply = message('responder', null);
    await settled();
    expect(widgetsOn(reply.id)).toEqual([{ kind: 'device', id: lamp }]);
  });

  it('forgets held widgets when the person writes again', async () => {
    await tools.call('set_power', { deviceId: lamp, on: true }, caller);
    message('person', null);
    await settled();
    const reply = message('responder', null);
    await settled();
    expect(widgetsOn(reply.id)).toEqual([]);
  });

  it('adds nothing outside a chat or when the tool failed', async () => {
    const reply = message('responder', 'working');
    await tools.call('set_power', { deviceId: lamp }, { ...caller, chatId: null });
    await tools.call('no_such_tool', { deviceId: lamp }, caller);
    expect(widgetsOn(reply.id)).toEqual([]);
  });

  it('shows widgets for Claude Code or Codex tool calls in the chat they answer', async () => {
    const worker = workerChat('Coordinator');
    message('person', 'working', worker);
    calls.called({
      name: 'update_device',
      args: { what: 'device', deviceId: lamp, name: 'Desk' },
      output: {},
      caller: null,
    });
    const reply = message('responder', null, worker);
    await settled();
    expect(widgetsOn(reply.id)).toEqual([
      { kind: 'device_settings_link', id: lamp, value: 'Desk' },
    ]);
  });

  it('skips worker tool calls when it is unclear which chat they belong to', async () => {
    const first = workerChat('Claude');
    const second = workerChat('Codex');
    message('person', 'working', first);
    message('person', 'working', second);
    calls.called({ name: 'set_power', args: { deviceId: lamp }, output: {}, caller: null });
    const reply = message('responder', null, first);
    await settled();
    expect(widgetsOn(reply.id)).toEqual([]);
  });

  it('leaves out widgets with nothing to show', async () => {
    const reply = message('responder', 'working');
    await tools.call('set_power', { deviceId: '99999999-9999-4999-8999-999999999999' }, caller);
    expect(widgetsOn(reply.id)).toEqual([]);
  });
});
