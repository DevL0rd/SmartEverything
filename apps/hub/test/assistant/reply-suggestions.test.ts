import {
  DEFAULT_ENGINE,
  NO_PRICES,
  REPLY_SUGGESTIONS_KIND,
  type AiModelRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { ReplySuggestions } from '../../src/assistant/suggestions/reply-suggestions';
import type { ChatRequest } from '../../src/openrouter/chat-types';
import type { OrChunk } from '../../src/openrouter/wire';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs } from '../support/logs';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const MOMENT = '2026-10-01T00:00:00.000Z';

const MODEL: AiModelRow = {
  id: 'google/gemini-3.5-flash-lite',
  provider: 'openrouter',
  name: 'Flash Lite',
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

let opened: TestStore;
let owner: ChatOwner;
let chats: ChatDirectory;
let requests: ChatRequest[];
let suggestions: ReplySuggestions;

async function* answer(): AsyncGenerator<OrChunk> {
  await Promise.resolve();
  yield {
    id: 'gen-1',
    model: MODEL.id,
    choices: [{ delta: { content: '- Yes please\n- Not now' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 30, completion_tokens: 8, cost: 0.0001 },
  };
}

beforeEach(async () => {
  captureLogs();
  requests = [];
  opened = await testStore(() => new Date(MOMENT));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  const now = (): Date => new Date(MOMENT);
  chats = new ChatDirectory(
    store,
    new AssistantFiles({ dataDirectory: opened.directory, chat: store.assistantChat, now }),
    now,
  );
  suggestions = new ReplySuggestions({
    store,
    log: testLogger('assistant'),
    client: {
      chat: (request): AsyncGenerator<OrChunk> => {
        requests.push(request);
        return answer();
      },
    },
    catalogue: {
      rows: (): AiModelRow[] => [MODEL],
      effortFor: (): null => null,
      onChange: (): (() => void) => () => undefined,
    },
  });
});

afterEach(async () => {
  await opened.close();
});

function exchange(): { readonly event: StoredEvent; readonly replyId: string } {
  const chat = chats.create(owner, { engine: DEFAULT_ENGINE });
  const conversation = new ConversationLog(opened.store);
  const person = conversation.person({
    chat,
    clientId: null,
    author: 'Sam',
    text: 'Should I turn the lights off?',
    files: [],
    origin: { source: 'app', plugin_id: null, device_id: null, name: null },
  });
  const reply = conversation.responderInChat({ chat, text: 'They are on.', replyTo: person.id });
  const event: StoredEvent = {
    cursor: 1,
    id: 'event-1',
    kind: 'chat',
    chat_id: chat.id,
    message_id: person.id,
    profile_id: chat.profile_id,
    client_id: null,
    text: person.text,
    report_to: null,
    hops: 0,
    received_at: MOMENT,
    delivered_at: MOMENT,
    answered_at: MOMENT,
  };
  return { event, replyId: reply.id };
}

async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
  }
}

function embedKinds(replyId: string): string[] {
  return opened.store.assistantChat.message(replyId).embeds.map((embed) => embed.kind);
}

describe('reply suggestions', () => {
  it('attaches suggestions to the latest reply of an app message on any engine', async () => {
    const { event, replyId } = exchange();
    opened.store.assistantChat.saveSettings({
      ...opened.store.assistantChat.settings(),
      reply_suggestions: true,
    });
    suggestions.afterReply(event, 'They are on.', true);
    await settled();
    expect(requests).toHaveLength(1);
    expect(embedKinds(replyId)).toContain(REPLY_SUGGESTIONS_KIND);
  });

  it('requests nothing when the setting is off', async () => {
    const { event, replyId } = exchange();
    opened.store.assistantChat.saveSettings({
      ...opened.store.assistantChat.settings(),
      reply_suggestions: false,
    });
    suggestions.afterReply(event, 'They are on.', true);
    await settled();
    expect(requests).toHaveLength(0);
    expect(embedKinds(replyId)).not.toContain(REPLY_SUGGESTIONS_KIND);
  });

  it('requests nothing for a failed turn', async () => {
    const { event } = exchange();
    opened.store.assistantChat.saveSettings({
      ...opened.store.assistantChat.settings(),
      reply_suggestions: true,
    });
    suggestions.afterReply(event, 'They are on.', false);
    await settled();
    expect(requests).toHaveLength(0);
  });
});
