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
  it('keeps the tools a finished or failed reply used, with how each ended', () => {
    const { log, chatId } = newChatLog();
    const chat = opened.store.aiChats.chat(chatId);
    const done = log.startReply(chat, null, 'google/gemini-3.8-flash');
    const answered = log.finishReply(done.id, 'Roasted chicken.', {
      model: 'google/gemini-3.8-flash',
      steps: [
        { title: 'Read health', outcome: 'done' },
        { title: '  ', outcome: 'done' },
        { title: 'Control devices', outcome: 'retried' },
      ],
      sources: [],
    });
    expect(answered.steps).toEqual(['Read health', 'Control devices']);
    expect(answered.step_states).toEqual(['done', 'retried']);
    const broken = log.startReply(chat, null, 'google/gemini-3.8-flash');
    log.failReply(broken.id, { text: '', reason: 'Stopped.', code: 'stopped' }, [
      { title: 'Control devices', outcome: 'failed' },
    ]);
    const failed = opened.store.assistantChat.message(broken.id);
    expect(failed.steps).toEqual(['Control devices']);
    expect(failed.step_states).toEqual(['failed']);
    expect(failed).toMatchObject({ state: 'failed', reason: 'Stopped.', reason_code: 'stopped' });
  });

  it('attaches the web sources a finished reply cited, and replaces them on a later finish', () => {
    const { log, chatId } = newChatLog();
    const chat = opened.store.aiChats.chat(chatId);
    const reply = log.startReply(chat, null, 'google/gemini-3.8-flash');
    const finish = (title: string): ReturnType<ConversationLog['finishReply']> =>
      log.finishReply(reply.id, 'Done.', {
        model: 'google/gemini-3.8-flash',
        steps: [],
        sources: [{ url: 'https://example.com/a', title }],
      });
    expect(finish('First').embeds).toMatchObject([{ kind: 'web_sources' }]);
    const again = finish('Second');
    expect(again.embeds).toHaveLength(1);
    expect(JSON.stringify(again.embeds)).toContain('Second');
    expect(JSON.stringify(again.embeds)).not.toContain('First');
  });
});
