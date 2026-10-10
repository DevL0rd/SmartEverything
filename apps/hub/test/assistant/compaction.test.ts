import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { Compactor, tokensOf } from '../../src/assistant/engines/openrouter/compaction';
import type { TurnUsage } from '../../src/assistant/engines/openrouter/turn-loop';
import { AssistantFiles } from '../../src/assistant/files';
import type { ChatChunk, ChatRequest } from '../../src/openrouter/chat-types';
import { TurnAccumulator } from '../../src/openrouter/turn';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let conversation: ConversationLog;
let compactor: Compactor;
let chat: AiChatRow;
let requests: ChatRequest[];
let usage: TurnUsage[];
let clock: number;

async function* summary(): AsyncIterable<ChatChunk> {
  await Promise.resolve();
  yield { type: 'start', generationId: 'gen-s', model: 'anthropic/claude-sonnet-5' };
  yield { type: 'text', text: 'Sam asked about the lights; all are off now.' };
  yield { type: 'finish', reason: 'stop' };
}

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-10T08:00:00.000Z');
  requests = [];
  usage = [];
  opened = await testStore(() => new Date(clock));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' as const };
  const now = (): Date => new Date(clock);
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now,
  });
  chat = new ChatDirectory(store, files, now).create(owner, { engine: DEFAULT_ENGINE });
  conversation = new ConversationLog(store);
  compactor = new Compactor({
    store,
    conversation,
    newTurn: (): TurnAccumulator => new TurnAccumulator(),
    client: {
      chat: (request): AsyncIterable<ChatChunk> => {
        requests.push(request);
        return summary();
      },
    },
  });
  for (let index = 0; index < 10; index += 1) {
    clock += 1000;
    conversation.person({
      chat,
      clientId: null,
      author: 'Sam',
      text: `Message ${String(index)} ${'about the lights '.repeat(20)}`,
      files: [],
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
    });
  }
});

afterEach(async () => {
  await opened.close();
});

function fit(window: number | null): ReturnType<Compactor['fit']> {
  return compactor.fit({
    chat,
    model: 'anthropic/claude-sonnet-5',
    window,
    prefix: [{ role: 'system', content: 'Rules' }],
    signal: new AbortController().signal,
    usage: (entry): void => {
      usage.push(entry);
    },
  });
}

describe('chat compaction', () => {
  it('sends the whole chat while it fits under the threshold', async () => {
    const context = await fit(100_000);
    expect(context.summary).toBeNull();
    expect(context.rows).toHaveLength(10);
    expect(requests).toHaveLength(0);
  });

  it('summarises the oldest part once at the threshold and keeps the newest rows', async () => {
    const rows = opened.store.assistantChat.since(chat.id, null);
    const window = Math.ceil(tokensOf(rows) / 0.9);
    const context = await fit(window);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.cacheControl).toBe(true);
    expect(context.summary).toBe('Sam asked about the lights; all are off now.');
    expect(context.rows.length).toBeGreaterThanOrEqual(4);
    expect(context.rows.length).toBeLessThan(10);
    expect(context.rows.at(-1)?.text).toContain('Message 9');
    expect(usage[0]?.work).toBe('chat');
    const again = await fit(window);
    expect(requests).toHaveLength(1);
    expect(again.summary).toBe(context.summary);
    const marker = opened.store.assistantChat.latestWithEmbed(chat.id, 'compaction');
    expect(marker?.embeds[0]?.kind).toBe('compaction');
  });

  it('never compacts when the model has no known window', async () => {
    const context = await fit(null);
    expect(context.rows).toHaveLength(10);
    expect(requests).toHaveLength(0);
  });
});
