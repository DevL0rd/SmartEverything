import {
  DEFAULT_ENGINE,
  NO_PRICES,
  type AiEffort,
  type AiModelRow,
  type AiUsageRow,
  type UsageEntry,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { ChatTitles } from '../../src/assistant/titles/chat-titles';
import { cleanTitle } from '../../src/assistant/titles/title-text';
import type { ChatChunk, ChatRequest } from '../../src/openrouter/chat-types';
import { TurnAccumulator } from '../../src/openrouter/turn';
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

let opened: TestStore;
let chats: ChatDirectory;
let owner: ChatOwner;
let replies: string[];
let requests: ChatRequest[];
let entries: UsageEntry[];
let rows: AiModelRow[];
let broken: boolean;
let listeners: (() => void)[];
let titles: ChatTitles;
let logs: CapturedLogs;

async function* answer(text: string): AsyncIterable<ChatChunk> {
  await Promise.resolve();
  yield {
    type: 'start',
    generationId: 'gen-1',
    model: 'google/gemini-3.5-flash-lite',
  };
  if (broken) {
    throw new Error('The connection dropped.');
  }
  yield { type: 'text', text };
  yield { type: 'finish', reason: 'stop' };
}

beforeEach(async () => {
  logs = captureLogs();
  replies = [];
  requests = [];
  entries = [];
  listeners = [];
  broken = false;
  rows = [model('google/gemini-3.5-flash'), model('google/gemini-3.5-flash-lite')];
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
  titles = new ChatTitles({
    store,
    client: {
      chat: (request): AsyncIterable<ChatChunk> => {
        requests.push(request);
        return answer(replies.shift() ?? '');
      },
    },
    catalogue: {
      rows: (): readonly AiModelRow[] => rows,
      effortFor: (): AiEffort | null => null,
      onChange: (listener): (() => void) => {
        listeners.push(listener);
        return (): void => {
          listeners = listeners.filter((other) => other !== listener);
        };
      },
    },
    newTurn: () => new TurnAccumulator(),
    ledger: {
      record: (entry): AiUsageRow => {
        entries.push(entry);
        return store.ledger.record(entry);
      },
    },
    now,
    log: testLogger('assistant'),
  });
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
  it('names a new chat from its first exchange and records the cost', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    replies.push('"Planning the garden lights 🌙."');
    titles.afterReply(exchange(chat.id, 'Turn on the garden lights at dusk'), 'Done.', true);
    await settled();
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Planning the garden lights');
    expect(opened.store.aiChats.titleAuto(chat.id)).toBe(false);
    expect(requests[0]?.model).toBe('google/gemini-3.5-flash-lite');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.chat_id).toBe(chat.id);
    expect(entries[0]?.work).toBe('chat');
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

  it('keeps the default title when the model has no usable answer or no model exists', async () => {
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

  it('records a call that broke off as an estimated cost to reconcile', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    broken = true;
    titles.afterReply(exchange(chat.id, 'Hi'), 'Hello', true);
    await settled();
    expect(entries).toEqual([
      expect.objectContaining({
        generation_id: 'gen-1',
        cost_micros: 0,
        cost_state: 'estimated',
        chat_id: chat.id,
      }),
    ]);
    expect(opened.store.aiChats.titleAuto(chat.id)).toBe(true);
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

  it('backfills once, after the model list loads', async () => {
    const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
    titles.afterReply(exchange(chat.id, 'Water the plants'), 'Will do', false);
    opened.store.assistantChat.addMessage({
      profile_id: chat.profile_id,
      client_id: null,
      role: 'responder',
      kind: 'text',
      author: 'Coordinator',
      text: 'Will do',
      attachments: [],
      state: 'answered',
      reason: null,
      steps: [],
      reply_to: null,
      chat_id: chat.id,
      origin: null,
      embeds: [],
      cost_micros: 0,
      model: null,
    });
    rows = [];
    titles.backfill();
    expect(listeners).toHaveLength(1);
    rows = [model('google/gemini-3.5-flash-lite')];
    replies.push('Watering the plants');
    listeners.forEach((listener) => {
      listener();
    });
    await settled();
    expect(listeners).toHaveLength(0);
    expect(opened.store.aiChats.chat(chat.id).title).toBe('Watering the plants');
    titles.backfill();
    await settled();
    expect(requests).toHaveLength(1);
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
