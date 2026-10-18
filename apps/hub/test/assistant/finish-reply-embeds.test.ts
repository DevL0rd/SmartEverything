import {
  DEFAULT_ENGINE,
  WEB_SOURCES_KIND,
  chatWidgetsOf,
  type AiChatRow,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { attachWidgets } from '../../src/chat-widgets/attach-widgets';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let conversation: ConversationLog;
let chat: AiChatRow;

const SOURCES = [{ url: 'https://example.com/a', title: 'A' }];
const NEWER = [{ url: 'https://example.com/b', title: 'B' }];

function done(
  sources: { url: string; title: string }[],
): Parameters<ConversationLog['finishReply']>[2] {
  return { model: 'anthropic/claude-sonnet-5', steps: [], sources };
}

function embedsOf(id: string): AssistantMessageRow['embeds'] {
  return opened.store.assistantChat.message(id).embeds;
}

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' as const };
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now: (): Date => new Date(),
  });
  chat = new ChatDirectory(store, files, (): Date => new Date()).create(owner, {
    engine: DEFAULT_ENGINE,
  });
  conversation = new ConversationLog(store);
});

afterEach(async () => {
  await opened.close();
});

describe('finishReply embeds', () => {
  it('keeps widgets attached during the turn when there are no sources', () => {
    const reply = conversation.startReply(chat, null, 'anthropic/claude-sonnet-5');
    attachWidgets(opened.store, reply, [{ kind: 'weather' }]);
    const finished = conversation.finishReply(reply.id, 'Done', done([]));
    expect(chatWidgetsOf(finished.embeds)).toEqual([{ kind: 'weather' }]);
    expect(embedsOf(reply.id).some((embed) => embed.kind === WEB_SOURCES_KIND)).toBe(false);
  });

  it('keeps widgets and adds the sources embed, replacing an older one', () => {
    const reply = conversation.startReply(chat, null, 'anthropic/claude-sonnet-5');
    attachWidgets(opened.store, reply, [{ kind: 'weather' }]);
    conversation.finishReply(reply.id, 'Done', done(SOURCES));
    expect(chatWidgetsOf(embedsOf(reply.id))).toEqual([{ kind: 'weather' }]);
    expect(embedsOf(reply.id).filter((embed) => embed.kind === WEB_SOURCES_KIND)).toEqual([
      { kind: WEB_SOURCES_KIND, sources: SOURCES },
    ]);
    conversation.finishReply(reply.id, 'Done again', done(NEWER));
    expect(chatWidgetsOf(embedsOf(reply.id))).toEqual([{ kind: 'weather' }]);
    expect(embedsOf(reply.id).filter((embed) => embed.kind === WEB_SOURCES_KIND)).toEqual([
      { kind: WEB_SOURCES_KIND, sources: NEWER },
    ]);
  });
});
