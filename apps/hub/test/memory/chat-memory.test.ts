import { remember, everyone } from '../support/memory-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { MemoryService } from '../../src/memory/service';
import { TEST_ENGINE } from '../support/engine';
import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let service: MemoryService;
let profileId: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  service = new MemoryService(
    opened.store.aiMemories,
    opened.store.aiChats,
    new FakeMemoryEmbedder(),
  );
  profileId = opened.store.profiles.create({ name: 'Ida' }).id;
  await remember(service, principal(null), { scope: 'person', text: 'Ida takes the 7:40 bus' });
});

afterEach(async () => {
  await opened.close();
});

function principal(chatId: string | null): MemoryPrincipal {
  return { profileId, role: 'member', chatId, messageId: null };
}

function chat(memory: boolean): string {
  const id = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  }).id;
  if (!memory) opened.store.aiChats.update(id, { memory: false });
  return id;
}

function state(chatId: string | null): { offered: boolean; recalled: number } {
  const who = principal(chatId);
  return { offered: service.offered(who), recalled: everyone(service.recall(who)).length };
}

describe('memory switched per chat', () => {
  it('starts on for a new chat', () => {
    expect(opened.store.aiChats.chat(chat(true)).memory).toBe(true);
  });

  it('works when the person and the chat both have it on', () => {
    expect(state(chat(true))).toStrictEqual({ offered: true, recalled: 1 });
  });

  it('is off in a chat switched off while the person has it on, and other chats keep it', () => {
    const quiet = chat(false);
    const other = chat(true);
    expect(state(quiet)).toStrictEqual({ offered: false, recalled: 0 });
    expect(state(other)).toStrictEqual({ offered: true, recalled: 1 });
  });

  it('is off in a chat switched on while the person has it off', () => {
    const on = chat(true);
    service.changeSettings(principal(null), { enabled: false });
    expect(state(on)).toStrictEqual({ offered: false, recalled: 0 });
  });

  it('follows the person switch alone when the session has no chat', () => {
    expect(state(null)).toStrictEqual({ offered: true, recalled: 1 });
    service.changeSettings(principal(null), { enabled: false });
    expect(state(null)).toStrictEqual({ offered: false, recalled: 0 });
  });

  it('turns back on for the chat when switched on again', () => {
    const id = chat(false);
    opened.store.aiChats.update(id, { memory: true });
    expect(state(id)).toStrictEqual({ offered: true, recalled: 1 });
  });
});
