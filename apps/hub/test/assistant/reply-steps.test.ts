import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
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

function newChatLog(): { readonly log: ConversationLog; readonly chatId: string } {
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
  return { log: new ConversationLog(store), chatId: chat.id };
}

describe('reply steps', () => {
  it('keeps the tools a finished or failed reply used', () => {
    const { log, chatId } = newChatLog();
    const chat = opened.store.aiChats.chat(chatId);
    const done = log.startReply(chat, null, 'google/gemini-3.8-flash');
    const answered = log.finishReply(done.id, 'Roasted chicken.', 'google/gemini-3.8-flash', [
      'Read health',
      '  ',
    ]);
    expect(answered.steps).toEqual(['Read health']);
    const broken = log.startReply(chat, null, 'google/gemini-3.8-flash');
    log.failReply(broken.id, '', 'Stopped.', ['Control devices']);
    expect(opened.store.assistantChat.message(broken.id).steps).toEqual(['Control devices']);
  });
});
