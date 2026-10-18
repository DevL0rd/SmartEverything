import { describe, expect, it } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';
import { applyFilter, countsOf, emptyTitleOf, filterOfParam, withoutPending } from './list-filters';

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

const POOL = [
  entry('quiet'),
  entry('asking', { requests: 2 }),
  entry('unread', { unread: 3 }),
  entry('busy', { line: { kind: 'working', step: null } }),
  entry('both', { requests: 1, unread: 1 }),
];

describe('chat list filters', () => {
  it('counts the chats that need the person next to unread and running', () => {
    const counts = countsOf(POOL);
    expect(counts.needs).toBe(2);
    expect(counts.unread).toBe(2);
    expect(counts.running).toBe(1);
  });

  it('keeps only chats with open requests under the needs-you filter', () => {
    expect(applyFilter(POOL, 'needs').map((chat) => chat.id)).toEqual(['asking', 'both']);
  });

  it('opens the needs-you filter from a deep link', () => {
    expect(filterOfParam('needs')).toBe('needs');
    expect(emptyTitleOf('needs')).toBe('Nothing needs you');
  });

  it('drops a chat waiting to be deleted together with its agents', () => {
    const pool = [
      entry('parent'),
      entry('agent', { kind: 'subagent', parentId: 'parent' }),
      entry('nested', { kind: 'subagent', parentId: 'agent' }),
      entry('other'),
    ];
    expect(withoutPending(pool, new Set(['parent'])).map((chat) => chat.id)).toEqual(['other']);
    expect(withoutPending(pool, new Set())).toBe(pool);
  });
});
