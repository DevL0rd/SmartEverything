import {
  DEFAULT_ENGINE,
  MCP_PART_TEXTS,
  SHOW_WIDGETS_INPUT,
  chatWidgetsOf,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { showWidgets } from '../src/chat-widgets/show-widgets';
import { TOOLS } from '../src/extensions/mcp/tools';
import { ToolError } from '../src/extensions/mcp/tools/registry';
import { voiceSet } from '../src/assistant-voice/voice-tools';
import { WIDGET_MANNER } from '../src/ai-tools/tool-guide';
import { stablePrompt } from '../src/assistant/engines/openrouter/context';
import type { HubTool, HubToolResult } from '../src/ai-tools/hub-tool';
import { ToolHub } from '../src/ai-tools/tool-hub';
import { FakeClock } from './support/fake-clock';
import { testStore, type TestStore } from './support/store';

const MISSING = '99999999-9999-4999-8999-999999999999';

let opened: TestStore;
let chatId: string;
let profileId: string;
let lamp: string;
let camera: string;

function message(
  role: 'person' | 'responder',
  state: 'working' | null,
  embeds: { kind: string }[] = [],
): AssistantMessageRow {
  return opened.store.assistantChat.addMessage({
    profile_id: profileId,
    client_id: null,
    role,
    kind: 'text',
    author: role === 'person' ? 'Sam' : 'Coordinator',
    text: '',
    attachments: [],
    state,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chatId,
    origin: null,
    embeds,
    cost_micros: 0,
    model: null,
  });
}

function context(chat: string | null = chatId): Parameters<typeof showWidgets>[0] {
  return {
    store: opened.store,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    actor: { clientId: null, profileId, chatId: chat },
  };
}

function widgetsOn(id: string): unknown[] {
  return chatWidgetsOf(opened.store.assistantChat.message(id).embeds);
}

function device(externalId: string, kind: 'light' | 'camera'): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId,
      parentId: null,
      kind,
      name: externalId,
      model: externalId,
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  opened = await testStore();
  profileId = opened.store.profiles.first().id;
  chatId = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  }).id;
  lamp = device('lamp-1', 'light');
  camera = device('cam-1', 'camera');
});

afterEach(async () => {
  await opened.close();
});

describe('show_widgets', () => {
  it('puts the chosen widgets under the reply being written', () => {
    const reply = message('responder', 'working');
    const result = showWidgets(context(), [
      { kind: 'device', id: lamp },
      { kind: 'camera', id: camera },
      { kind: 'weather' },
    ]);
    expect(result).toEqual({ added: 3, already_shown: 0 });
    expect(widgetsOn(reply.id)).toEqual([
      { kind: 'device', id: lamp },
      { kind: 'camera', id: camera },
      { kind: 'weather' },
    ]);
  });

  it('adds across several calls and never twice', () => {
    const reply = message('responder', 'working');
    showWidgets(context(), [{ kind: 'device', id: lamp }]);
    const second = showWidgets(context(), [{ kind: 'device', id: lamp }, { kind: 'weather' }]);
    expect(second).toEqual({ added: 1, already_shown: 1 });
    expect(widgetsOn(reply.id)).toHaveLength(2);
  });

  it('adds nothing when other tools run on a device', async () => {
    const reply = message('responder', 'working');
    const power: HubTool = {
      name: 'set_power',
      title: 'Power',
      description: 'Turn a device on or off',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      origin: { kind: 'se' },
      humanOnly: false,
    };
    const hub = new ToolHub([
      {
        tools: (): HubTool[] => [power],
        validate: (): null => null,
        changes: (): (() => void) => () => undefined,
        call: (): Promise<HubToolResult> =>
          Promise.resolve({ response: { result: 'done' }, line: '', pictures: [] }),
      },
    ]);
    await hub.call(
      'set_power',
      { deviceId: lamp, on: true },
      { profileId, role: 'owner', chatId, via: 'chat', clientId: null },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(widgetsOn(reply.id)).toEqual([]);
  });

  it('keeps the embeds a message already had', () => {
    const reply = message('responder', 'working', [{ kind: 'weather' }]);
    showWidgets(context(), [{ kind: 'device', id: lamp }]);
    expect(widgetsOn(reply.id)).toEqual([{ kind: 'weather' }, { kind: 'device', id: lamp }]);
  });

  it('refuses outside a chat and when no reply is being written', () => {
    message('responder', null);
    expect(() => showWidgets(context(null), [{ kind: 'weather' }])).toThrow(ToolError);
    expect(() => showWidgets(context(), [{ kind: 'weather' }])).toThrow(
      'There is no reply being written',
    );
  });

  it('names what is wrong and attaches none when a widget has nothing to show', () => {
    const reply = message('responder', 'working');
    expect(() =>
      showWidgets(context(), [
        { kind: 'device', id: lamp },
        { kind: 'camera', id: MISSING },
        { kind: 'health', metric: 'steps', range: 'week' },
      ]),
    ).toThrow(`There is no device ${MISSING}. There is no steps data in the last 30 days`);
    expect(widgetsOn(reply.id)).toEqual([]);
  });

  it('says which kind to use when a camera is shown as a device', () => {
    message('responder', 'working');
    expect(() => showWidgets(context(), [{ kind: 'device', id: camera }])).toThrow(
      'is a camera: use kind camera',
    );
  });

  it('rejects an unknown widget kind with a clear error, and lists the kinds', () => {
    const parsed = SHOW_WIDGETS_INPUT.safeParse({ widgets: [{ kind: 'hologram' }] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['widgets', 0, 'kind']);
    const text = MCP_PART_TEXTS.find((part) => part.name === 'show_widgets')?.description ?? '';
    expect(text).toContain('camera (');
    expect(text).toContain('health (');
  });
});

describe('where show_widgets is offered', () => {
  const listed = TOOLS.find((tool) => tool.name === 'show_widgets');

  it('is in the tool registry for chat, with the instruction, and not in voice', () => {
    expect(listed).toBeDefined();
    const hubTool: HubTool = {
      name: 'show_widgets',
      title: 'Show widgets',
      description: '',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      origin: { kind: 'se' },
      humanOnly: false,
    };
    expect(voiceSet([hubTool], false, false).map((tool) => tool.name)).toEqual([
      'end_conversation',
    ]);
    expect(
      stablePrompt({
        name: 'A',
        profileName: 'Sam',
        role: 'owner',
        homeName: 'H',
        timeZone: 'UTC',
        now: new Date('2026-10-08T10:00:00.000Z'),
        chat: { title: 'T', id: chatId, kind: 'chat' },
        toolIndex: '',
        catalogue: '',
        instructions: '',
      }),
    ).toContain(WIDGET_MANNER);
  });
});
