import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { TEST_ENGINE } from '../support/engine';

let opened: TestStore;
let chatId: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const chat = store.aiChats.create({
    profileId: store.profiles.activeOf(client.id).id,
    kind: 'chat',
    title: 'Planning',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: { ...TEST_ENGINE, model: 'vendor/small' },
  });
  chatId = chat.id;
  store.aiChats.noteContext(chatId, 54);
});

afterEach(async () => {
  await opened.close();
});

describe('how full a chat is shown after the chat changes', () => {
  it('keeps the figure when only the title or the thinking effort changes', () => {
    const { aiChats } = opened.store;
    aiChats.update(chatId, { title: 'Renamed' });
    aiChats.update(chatId, {
      engine: { ...TEST_ENGINE, model: 'vendor/small', effort: 'high' },
    });
    expect(aiChats.chat(chatId).context_percent).toBe(54);
  });

  it('forgets the figure when another model takes over, since it measured the old model’s window', () => {
    const { aiChats } = opened.store;
    aiChats.update(chatId, { engine: { ...TEST_ENGINE, model: 'vendor/large' } });
    expect(aiChats.chat(chatId).context_percent).toBeNull();
  });
});

describe('how much of the latest request came from the prompt cache', () => {
  it('keeps the latest counts and forgets them when another model takes over', () => {
    const { aiChats } = opened.store;
    expect(aiChats.chat(chatId).last_cached_tokens).toBeNull();
    aiChats.noteCacheReads(chatId, 1000, 920);
    expect(aiChats.chat(chatId)).toMatchObject({
      last_input_tokens: 1000,
      last_cached_tokens: 920,
    });
    aiChats.noteCacheReads(chatId, 1200, null);
    expect(aiChats.chat(chatId)).toMatchObject({
      last_input_tokens: 1200,
      last_cached_tokens: null,
    });
    aiChats.noteCacheReads(chatId, 1300, 1100);
    aiChats.update(chatId, { engine: { ...TEST_ENGINE, model: 'vendor/large' } });
    expect(aiChats.chat(chatId)).toMatchObject({
      last_input_tokens: null,
      last_cached_tokens: null,
    });
  });
});
