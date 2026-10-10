import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { costRolledUp } from '../../src/assistant/cost-rollup';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => new Date());
});

afterEach(async () => {
  await opened.close();
});

function replyInNewChat(): { chatId: string; profileId: string; messageId: string } {
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const profileId = store.profiles.activeOf(client.id).id;
  const now = (): Date => new Date();
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now,
  });
  const chat = new ChatDirectory(store, files, now).create(
    { profileId, role: 'owner' },
    { engine: DEFAULT_ENGINE },
  );
  const reply = new ConversationLog(store).startReply(chat, null, 'openai/gpt-6-luna');
  return { chatId: chat.id, profileId, messageId: reply.id };
}

describe('a generation priced after its reply was deleted by a retry', () => {
  it('still settles the usage and adds the cost to the chat', () => {
    const { store } = opened;
    const { chatId, profileId, messageId } = replyInNewChat();
    store.ledger.rollup(costRolledUp(store));
    const usage = store.ledger.record({
      profile_id: profileId,
      chat_id: chatId,
      message_id: messageId,
      source: 'openrouter',
      work: 'chat',
      model_id: 'openai/gpt-6-luna',
      generation_id: 'gen-1',
      cost_micros: 0,
      cost_state: 'reported',
    });
    store.assistantChat.removeMessages([messageId]);
    const settled = store.ledger.reconcile(usage.id, { cost_micros: 500 });
    expect(settled.cost_state).toBe('reconciled');
    expect(store.aiChats.chat(chatId).cost_micros).toBe(500);
  });

  it('adds the cost to the reply and the chat while the reply exists', () => {
    const { store } = opened;
    const { chatId, profileId, messageId } = replyInNewChat();
    store.ledger.rollup(costRolledUp(store));
    store.ledger.record({
      profile_id: profileId,
      chat_id: chatId,
      message_id: messageId,
      source: 'openrouter',
      work: 'chat',
      model_id: 'openai/gpt-6-luna',
      generation_id: 'gen-2',
      cost_micros: 700,
      cost_state: 'reported',
    });
    expect(store.assistantChat.message(messageId).cost_micros).toBe(700);
    expect(store.aiChats.chat(chatId).cost_micros).toBe(700);
  });
});
