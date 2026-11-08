import { describe, expect, it } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';
import { hiddenChatIds, visibleAppChats } from './chat-visibility';

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

describe('chat sidebar visibility', () => {
  it('hides retired native chats and their descendants', () => {
    const pool = [
      entry('claude', { runtime: 'claude' }),
      entry('codex', { runtime: 'codex' }),
      entry('child', { kind: 'subagent', parentId: 'claude' }),
      entry('nested', { kind: 'subagent', parentId: 'child' }),
      entry('main'),
    ];
    expect(visibleAppChats(pool).map((row) => row.id)).toEqual(['main']);
  });

  it('lists admitted native roots alongside Coordinator and keeps their children', () => {
    const pool = [
      entry('main'),
      entry('codex', { runtime: 'codex', nativeAdmission: 'standalone' }),
      entry('agent', { kind: 'subagent', parentId: 'codex' }),
      entry('claude', { runtime: 'claude', nativeAdmission: 'standalone' }),
    ];
    expect(visibleAppChats(pool)).toEqual(pool);
    expect(hiddenChatIds([], pool)).toEqual(new Set());
  });

  it('keeps native subagents attached to a SmartEverything chat', () => {
    const pool = [
      entry('main'),
      entry('child', { kind: 'subagent', parentId: 'main', runtime: 'claude' }),
      entry('nested', { kind: 'subagent', parentId: 'child', runtime: 'codex' }),
    ];
    expect(visibleAppChats(pool)).toEqual(pool);
  });

  it('marks archived native chats and their known descendants as hidden in search', () => {
    const live = [entry('main'), entry('child', { kind: 'subagent', parentId: 'native' })];
    const archived = [entry('native', { runtime: 'codex', archived: true })];
    expect(hiddenChatIds(live, archived)).toEqual(new Set(['native', 'child']));
  });
});
