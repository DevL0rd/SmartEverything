import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatOwner } from '../../src/assistant/chat-directory';
import { removeProfileChats } from '../../src/assistant/remove-profile-chats';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let mine: string;
let theirs: string;
let removals: { readonly owner: ChatOwner; readonly chatId: string }[];

beforeEach(async () => {
  captureLogs();
  removals = [];
  opened = await testStore();
  const client = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  mine = opened.store.profiles.activeOf(client.id).id;
  theirs = opened.store.profiles.create({ name: 'Robin' }).id;
});

afterEach(async () => {
  await opened.close();
});

function chat(profileId: string, parentId: string | null = null): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: parentId === null ? 'chat' : 'subagent',
    title: 'Chat',
    icon: null,
    parentId,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    titleAuto: false,
  });
}

const assistant = {
  removeChat: (owner: ChatOwner, chatId: string): Promise<void> => {
    removals.push({ owner, chatId });
    opened.store.aiChats.removalIds(chatId).forEach((id) => {
      opened.store.aiChats.remove(id);
    });
    return Promise.resolve();
  },
};

function remaining(profileId: string): number {
  return [false, true].flatMap((archived) => opened.store.aiChats.chats({ profileId, archived }))
    .length;
}

describe('clearing the chat history of one profile', () => {
  it('removes every open and archived chat of that profile and nothing else', async () => {
    const open = chat(mine);
    const archived = opened.store.aiChats.update(chat(mine).id, { archived: true });
    const other = chat(theirs);
    await removeProfileChats(opened.store, assistant, mine);
    expect(remaining(mine)).toBe(0);
    expect(opened.store.aiChats.chat(other.id).profile_id).toBe(theirs);
    expect(removals.map((removal) => removal.chatId).sort()).toEqual([open.id, archived.id].sort());
  });

  it('removes a chat with its helper chats without removing any chat twice', async () => {
    const parent = chat(mine);
    chat(mine, parent.id);
    chat(mine, parent.id);
    await removeProfileChats(opened.store, assistant, mine);
    expect(remaining(mine)).toBe(0);
    const ids = removals.map((removal) => removal.chatId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(removals.every((removal) => removal.owner.profileId === mine)).toBe(true);
  });

  it('does nothing for a profile without chats', async () => {
    chat(theirs);
    await removeProfileChats(opened.store, assistant, mine);
    expect(removals).toEqual([]);
    expect(remaining(theirs)).toBe(1);
  });
});
