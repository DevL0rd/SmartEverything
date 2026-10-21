import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import type { AssistantDelivery } from '../../src/assistant/delivery';
import { AssistantFiles } from '../../src/assistant/files';
import { AssistantRequests } from '../../src/assistant/requests';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let requests: AssistantRequests;
let owner: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => new Date('2026-10-09T10:00:00.000Z'));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  owner = store.profiles.activeOf(client.id).id;
  const now = (): Date => new Date('2026-10-09T10:00:00.000Z');
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now,
  });
  requests = new AssistantRequests({
    store,
    files,
    chats: new ChatDirectory(store, files, now),
    conversation: new ConversationLog(store),
    delivery: (): AssistantDelivery => {
      throw new Error('posts never deliver');
    },
    voiceResult: (): null => null,
    done: (): void => undefined,
  });
});

afterEach(async () => {
  await opened.close();
});

describe('assistant posts', () => {
  it('posts into the person’s chat', async () => {
    const row = await requests.post(
      { text: 'Dinner is ready', files: [], profileId: owner, notify: false },
      true,
      () => owner,
      { profileId: owner, role: 'owner' },
    );
    expect(opened.store.aiChats.chat(row.chat_id).profile_id).toBe(owner);
  });

  it('refuses an id that is not a person instead of failing in the store', async () => {
    const post = requests.post(
      { text: 'Hi', files: [], profileId: '6b1f2a10-3c4d-4e5f-8a9b-0c1d2e3f4a5b', notify: false },
      true,
      () => owner,
      { profileId: owner, role: 'owner' },
    );
    await expect(post).rejects.toBeInstanceOf(ApiError);
    await expect(post).rejects.toThrow('take it from person_read');
    expect(opened.store.aiChats.chats({ profileId: owner, archived: false })).toHaveLength(0);
  });

  it('keeps a member’s post in their own chat', async () => {
    const other = opened.store.profiles.create({ name: 'Robin' }).id;
    const post = requests.post(
      { text: 'Hi', files: [], profileId: owner, notify: false },
      true,
      () => owner,
      { profileId: other, role: 'member' },
    );
    await expect(post).rejects.toThrow('only to your own chat');
    const row = await requests.post({ text: 'Hi', files: [], notify: false }, true, () => owner, {
      profileId: other,
      role: 'member',
    });
    expect(opened.store.aiChats.chat(row.chat_id).profile_id).toBe(other);
  });
});
