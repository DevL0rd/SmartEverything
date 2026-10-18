import { describe, expect, it } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';
import { partitionChats } from './chat-groups';

const NONE: ReadonlySet<'claude' | 'codex'> = new Set();

function entry(id: string, change: Partial<ChatEntry> = {}): ChatEntry {
  return {
    id,
    kind: 'chat',
    title: id,
    source: APP_SOURCE,
    at: '2026-10-16T09:00:00.000Z',
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: null,
    computerId: null,
    line: { kind: 'empty' },
    ...change,
  };
}

function idsOf(groups: ReturnType<typeof partitionChats>): Record<string, readonly string[]> {
  return Object.fromEntries(
    groups.map((group) => [group.key, group.entries.map((item) => item.id)]),
  );
}

describe('partitionChats', () => {
  it('keeps everything in one Chats group when no chat runs on a computer runtime', () => {
    const pool = [entry('a'), entry('b')];
    expect(idsOf(partitionChats(pool, pool, NONE))).toEqual({ chats: ['a', 'b'] });
  });

  it('puts Claude chats in their own group and omits it when empty', () => {
    const pool = [entry('a'), entry('c', { runtime: 'claude' })];
    expect(idsOf(partitionChats(pool, pool, NONE))).toEqual({ chats: ['a'], claude: ['c'] });
    const plain = [entry('a')];
    expect(partitionChats(plain, plain, NONE).map((group) => group.key)).toEqual(['chats']);
  });

  it('follows a sub-agent chat to the group of its main chat', () => {
    const pool = [
      entry('c', { runtime: 'claude' }),
      entry('sub', { kind: 'subagent', parentId: 'c' }),
      entry('main'),
      entry('main-sub', { kind: 'subagent', parentId: 'main' }),
    ];
    expect(idsOf(partitionChats(pool, pool, NONE))).toEqual({
      chats: ['main', 'main-sub'],
      claude: ['c', 'sub'],
    });
  });

  it('keeps the Chats group present even when only Claude chats match', () => {
    const pool = [entry('c', { runtime: 'claude' })];
    expect(idsOf(partitionChats(pool, pool, NONE))).toEqual({ chats: [], claude: ['c'] });
  });

  it('shows an empty Claude group when Claude is on and no Claude chat exists', () => {
    const pool = [entry('a')];
    const groups = partitionChats(pool, pool, new Set(['claude']));
    expect(idsOf(groups)).toEqual({ chats: ['a'], claude: [] });
    expect(groups[1]?.emptyText).toBe('No Claude chats yet.');
  });

  it('gives Codex its own group, shown when a computer has it available', () => {
    const pool = [entry('a'), entry('x', { runtime: 'codex' })];
    expect(idsOf(partitionChats(pool, pool, NONE))).toEqual({ chats: ['a'], codex: ['x'] });
    const plain = [entry('a')];
    expect(partitionChats(plain, plain, new Set(['codex'])).map((group) => group.key)).toEqual([
      'chats',
      'codex',
    ]);
  });
});
