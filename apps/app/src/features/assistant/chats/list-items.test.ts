import type { AiChatHit } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import { orphanAgentsOf, sectionsOf, type ChatEntry, type ChatLine } from './chat-entry';
import { itemsOf, type ListItem } from './list-items';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

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

function agent(id: string, parentId: string, at: string, line: ChatLine): ChatEntry {
  return entry(id, { kind: 'subagent', parentId, at, line });
}

function hit(chatId: string): AiChatHit {
  return {
    chatId,
    title: chatId,
    messageId: `message-${chatId}`,
    snippet: 'a snippet',
    at: '2026-10-16T09:00:00.000Z',
    archived: false,
  };
}

function typesOf(items: readonly ListItem[]): readonly string[] {
  return items.map(
    (item) => `${item.type}:${item.type === 'hit' ? item.hit.chatId : item.entry.id}`,
  );
}

const POOL = [
  entry('garage'),
  agent('idle-agent', 'garage', '2026-10-16T11:00:00.000Z', { kind: 'empty' }),
  agent('busy-agent', 'garage', '2026-10-16T08:00:00.000Z', { kind: 'working', step: null }),
];

describe('agent chats under their main chat', () => {
  it('lists the running agent before a newer idle one when the parent is expanded', () => {
    const [section] = itemsOf(
      sectionsOf(POOL, POOL, { now: NOW, timeZone: 'UTC' }),
      [],
      new Set(['garage']),
      new Map(),
    );
    expect(typesOf(section?.data ?? [])).toEqual([
      'chat:garage',
      'agent:busy-agent',
      'agent:idle-agent',
    ]);
  });

  it('keeps the agents out of the list while the parent is collapsed but counts them', () => {
    const [section] = itemsOf(
      sectionsOf(POOL, POOL, { now: NOW, timeZone: 'UTC' }),
      [],
      new Set(),
      new Map(),
    );
    expect(typesOf(section?.data ?? [])).toEqual(['chat:garage']);
    const first = section?.data[0];
    expect(first?.type === 'chat' ? first.agents.length : 0).toBe(2);
  });

  it('opens the parent when the search matched one of its agents', () => {
    const matched = [POOL[2] ?? entry('missing')];
    const sections = sectionsOf(matched, POOL, { now: NOW, timeZone: 'UTC' });
    const [section] = itemsOf(sections, [], new Set(), new Map());
    expect(typesOf(section?.data ?? [])).toEqual([
      'chat:garage',
      'agent:busy-agent',
      'agent:idle-agent',
    ]);
  });

  it('does not open every parent just because the list is unfiltered', () => {
    const sections = sectionsOf(POOL, POOL, { now: NOW, timeZone: 'UTC' });
    expect(
      sections.flatMap((section) => section.data.map((family) => family.matchedAgents)),
    ).toEqual([false]);
  });
});

describe('inactive agents', () => {
  it('collects agents whose parent is archived or deleted and keeps them out of the sections', () => {
    const pool = [
      ...POOL,
      agent('orphan', 'archived-parent', '2026-10-15T09:00:00.000Z', { kind: 'empty' }),
    ];
    expect(orphanAgentsOf(pool).map((item) => item.id)).toEqual(['orphan']);
    const ids = sectionsOf(pool, pool, { now: NOW, timeZone: 'UTC' }).flatMap((section) =>
      section.data.map((family) => family.entry.id),
    );
    expect(ids).toEqual(['garage']);
  });

  it('does not treat an agent of a live chat as inactive', () => {
    expect(orphanAgentsOf(POOL)).toEqual([]);
  });
});

describe('message search hits on agent chats', () => {
  it('opens the parent chat without a message when the hit is in an agent chat', () => {
    const entries = new Map(POOL.map((item) => [item.id, item]));
    const sections = itemsOf([], [hit('busy-agent'), hit('garage')], new Set(), entries);
    const [hits] = sections;
    const targets = (hits?.data ?? []).map((item) => (item.type === 'hit' ? item.target : null));
    expect(targets).toEqual([
      { chatId: 'garage', messageId: null },
      { chatId: 'garage', messageId: 'message-garage' },
    ]);
  });
});
