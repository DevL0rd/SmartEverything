import { DEFAULT_ENGINE, NO_PRICES, type AiModelRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { ChatTitles } from '../../src/assistant/titles/chat-titles';
import { cleanTitle } from '../../src/assistant/titles/title-text';
import type { SideParts } from '../../src/assistant/side-completion';
import type { ChatRequest } from '../../src/openrouter/chat-types';
import type { OrChunk } from '../../src/openrouter/wire';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const MOMENT = '2026-10-01T00:00:00.000Z';

function model(id: string): AiModelRow {
  return {
    id,
    provider: 'openrouter',
    name: id,
    author: 'google',
    author_name: 'Google',
    family: 'gemini',
    description: '',
    created: MOMENT,
    context_length: 1_000_000,
    max_output: 8192,
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: [],
    reasoning: 'none',
    efforts: [],
    default_effort: null,
    tools: true,
    alias_of: null,
    pricing: NO_PRICES,
    kinds: ['chat'],
    expires_at: null,
    synced_at: MOMENT,
    gone_at: null,
  };
}

async function* answer(text: string): AsyncGenerator<OrChunk> {
  await Promise.resolve();
  if (broken) throw new Error('The connection dropped.');
  yield {
    id: 'gen-1',
    model: 'google/gemini-3.5-flash-lite',
    choices: [{ delta: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 40, completion_tokens: 6, cost: 0.00012 },
  };
}

function parts(): SideParts {
  return {
    client: {
      chat: (request): AsyncGenerator<OrChunk> => {
        requests.push(request);
        return answer(replies.shift() ?? '');
      },
    },
    catalogue: {
      rows: () => rows,
      effortFor: () => null,
      onChange: (listener) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((entry) => entry !== listener);
        };
      },
    },
  };
}

let opened: TestStore;
let chats: ChatDirectory;
let owner: ChatOwner;
let replies: string[];
let requests: ChatRequest[];
let rows: AiModelRow[];
let listeners: (() => void)[];
let broken: boolean;
let titles: ChatTitles;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  replies = [];
  requests = [];
  rows = [model('google/gemini-3.5-flash-lite')];
  listeners = [];
  broken = false;
  opened = await testStore(() => new Date(MOMENT));
  const { store } = opened;
  const client = store.clients.create(
    {
      name: 'This computer',
      platform: 'desktop',
      role: 'owner',
      tokenHash: 'a',
    },
    true,
  );
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  const now = (): Date => new Date(MOMENT);
  chats = new ChatDirectory(
    store,
    new AssistantFiles({
      dataDirectory: opened.directory,
      chat: store.assistantChat,
      now,
    }),
    now,
  );
  titles = new ChatTitles({ store, ...parts(), now, log: testLogger('assistant') });
});

afterEach(async () => {
  await opened.close();
});

function exchange(chatId: string, person: string): StoredEvent {
  const conversation = new ConversationLog(opened.store);
  const chat = opened.store.aiChats.chat(chatId);
  const row = conversation.person({
    chat,
    clientId: null,
    author: 'Sam',
    text: person,
    files: [],
    origin: { source: 'app', plugin_id: null, device_id: null, name: null },
  });
  return {
    cursor: 1,
    id: 'event-1',
    kind: 'chat',
    chat_id: chatId,
    message_id: row.id,
    profile_id: chat.profile_id,
    client_id: null,
    text: person,
    report_to: null,
    hops: 0,
    received_at: MOMENT,
    delivered_at: MOMENT,
    answered_at: MOMENT,
  };
}

async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
  }
}

describe('chat titles', () => {
  it('names a new chat from its first exchange', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    replies.push('"Planning the garden lights 🌙."');
    titles.afterReply(exchange(chat.id, 'Turn on the garden lights at dusk'), 'Done.', true);
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Planning the garden lights');
    expect(opened.store.aiChats.titleAuto(chat.id)).toBe(false);
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0]?.messages)).toContain('Turn on the garden lights at dusk');
  });

  it('records the title request in the usage ledger against the chat', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    replies.push('Garden lights');
    titles.afterReply(exchange(chat.id, 'Turn on the garden lights'), 'Done.', true);
    await settled();
    const usage = opened.store.ledger.pendingGenerations();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      chat_id: chat.id,
      source: 'openrouter',
      work: 'chat',
      model_id: 'google/gemini-3.5-flash-lite',
      generation_id: 'gen-1',
      tokens_in: 40,
      tokens_out: 6,
      cost_micros: 120,
      cost_state: 'reported',
    });
  });

  it('never renames a chat the person named or renamed', async () => {
    const named = chats.create(owner, {
      title: 'Holiday',
      engine: DEFAULT_ENGINE,
    });
    const renamed = chats.create(owner, { engine: DEFAULT_ENGINE });
    chats.update(owner, renamed.id, { title: 'My list' });
    titles.afterReply(exchange(named.id, 'Hi'), 'Hello', true);
    titles.afterReply(exchange(renamed.id, 'Hi'), 'Hello', true);
    await settled();
    expect(requests).toHaveLength(0);
    expect(opened.store.aiChats.chat(renamed.id).title).toBe('My list');
  });

  it('keeps the default title when the answer is unusable or there is no small model yet', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    replies.push('  🌙 ');
    titles.afterReply(exchange(chat.id, 'Hi'), 'Hello', true);
    await settled();
    rows = [];
    titles.afterReply(exchange(chat.id, 'Hi'), 'Hello', true);
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('New chat');
    expect(opened.store.aiChats.titleAuto(chat.id)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(logs.events().filter((event) => event === 'assistant.title_failed')).toHaveLength(2);
  });

  it('keeps the default title and logs when the completion fails', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    broken = true;
    titles.afterReply(exchange(chat.id, 'Hi'), 'Hello', true);
    await settled();
    expect(opened.store.aiChats.titleAuto(chat.id)).toBe(true);
    expect(logs.events().filter((event) => event === 'assistant.title_failed')).toHaveLength(1);
  });

  it('skips failed replies and voice tasks, and names call chats from the transcript', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    titles.afterReply(exchange(chat.id, 'Hi'), 'Oops', false);
    titles.afterReply({ ...exchange(chat.id, 'Hi'), kind: 'voice' }, 'Sure', true);
    await settled();
    expect(requests).toHaveLength(0);
    replies.push('Kitchen timer for pasta');
    titles.afterCall(chat.id, 'Sam: set a timer for pasta\nCoordinator: ten minutes, done');
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Kitchen timer for pasta');
  });

  it('backfills the untitled chats once', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    for (const [role, text] of [
      ['person', 'Water the plants'],
      ['responder', 'Will do'],
    ] as const) {
      opened.store.assistantChat.addMessage({
        profile_id: chat.profile_id,
        client_id: null,
        role,
        kind: 'text',
        author: role === 'person' ? 'Sam' : 'Coordinator',
        text,
        attachments: [],
        state: 'answered',
        reason: null,
        steps: [],
        step_states: [],
        reply_to: null,
        chat_id: chat.id,
        origin: null,
        embeds: [],
        cost_micros: 0,
        model: null,
      });
    }
    replies.push('Watering the plants');
    titles.backfill();
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Watering the plants');
    titles.backfill();
    await settled();
    expect(requests).toHaveLength(1);
  });
});

describe('title backfill', () => {
  it('waits for the small model to appear in the model list before naming old chats', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    for (const [role, text] of [
      ['person', 'Water the plants'],
      ['responder', 'Will do'],
    ] as const) {
      opened.store.assistantChat.addMessage({
        profile_id: chat.profile_id,
        client_id: null,
        role,
        kind: 'text',
        author: role === 'person' ? 'Sam' : 'Coordinator',
        text,
        attachments: [],
        state: 'answered',
        reason: null,
        steps: [],
        step_states: [],
        reply_to: null,
        chat_id: chat.id,
        origin: null,
        embeds: [],
        cost_micros: 0,
        model: null,
      });
    }
    rows = [];
    replies.push('Watering the plants');
    titles.backfill();
    await settled();
    expect(requests).toHaveLength(0);
    rows = [model('google/gemini-3.5-flash-lite')];
    for (const listener of listeners) listener();
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Watering the plants');
  });
});

describe('cleanTitle', () => {
  it('keeps six words, drops quotes, emoji and end marks, and starts with a capital', () => {
    expect(cleanTitle('title: "the long list of things we must do today."')).toBe(
      'The long list of things we',
    );
    expect(cleanTitle('Don’t forget the milk!')).toBe('Don’t forget the milk');
    expect(cleanTitle('**')).toBeNull();
  });
});
