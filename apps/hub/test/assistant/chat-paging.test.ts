import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let profileId: string;
let tick: number;
let ticking: boolean;

beforeEach(async () => {
  captureLogs();
  tick = 0;
  ticking = true;
  opened = await testStore(() => new Date(Date.UTC(2026, 9, 17, 10, 0, ticking ? tick++ : tick)));
  const client = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  profileId = opened.store.profiles.activeOf(client.id).id;
});

afterEach(async () => {
  await opened.close();
});

function archivedChat(title: string, pinned = false): AiChatRow {
  const chat = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title,
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    titleAuto: false,
  });
  return opened.store.aiChats.update(chat.id, { archived: true, pinned });
}

function walk(size: number): string[] {
  const seen: string[] = [];
  for (;;) {
    const before = seen.at(-1);
    const page = opened.store.aiChats.chats({ profileId, archived: true, before, limit: size });
    seen.push(...page.map((chat) => chat.id));
    if (page.length < size) return seen;
  }
}

describe('paging through archived chats in the store', () => {
  it('walks the full list in the same order for every page size, pinned first', () => {
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((title) => archivedChat(title, title === 'd'));
    const whole = opened.store.aiChats.chats({ profileId, archived: true });
    expect(whole).toHaveLength(7);
    expect(whole[0]?.title).toBe('d');
    for (const size of [1, 2, 3, 7, 20]) expect(walk(size)).toEqual(whole.map((chat) => chat.id));
  });

  it('keeps the order stable when chats share the same moment', () => {
    ticking = false;
    ['a', 'b', 'c', 'd'].forEach((title) => archivedChat(title));
    const whole = opened.store.aiChats.chats({ profileId, archived: true });
    expect(new Set(whole.map((chat) => chat.created_at)).size).toBe(1);
    expect(walk(1)).toEqual(whole.map((chat) => chat.id));
    expect(walk(3)).toEqual(whole.map((chat) => chat.id));
  });

  it('returns nothing after the last chat', () => {
    archivedChat('a');
    const last = opened.store.aiChats.chats({ profileId, archived: true }).at(-1);
    expect(
      opened.store.aiChats.chats({ profileId, archived: true, before: last?.id, limit: 20 }),
    ).toEqual([]);
  });

  it('leaves unarchived chats out of an archived page', () => {
    archivedChat('a');
    opened.store.aiChats.create({
      profileId,
      kind: 'chat',
      title: 'open',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: DEFAULT_ENGINE,
      titleAuto: false,
    });
    expect(opened.store.aiChats.chats({ profileId, archived: true, limit: 20 })).toHaveLength(1);
  });
});
