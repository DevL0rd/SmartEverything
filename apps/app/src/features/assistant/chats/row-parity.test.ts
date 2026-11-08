import { AI_CHAT_ROW, type AiChatRow } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import * as entries from './entries';
import * as avatar from './row-avatar';
import * as status from './row-status';

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('../../../api/ai', () => ({ latestChatMessages: vi.fn(), removeAiChat: vi.fn() }));
vi.mock('./chat-actions', () => ({
  deleteChat: vi.fn(),
  setChatArchived: vi.fn(),
  setChatPinned: vi.fn(),
  setChatRead: vi.fn(),
}));

const DEVICE = '33333333-3333-4333-8333-333333333333';

function chat(engine: object, change: Partial<AiChatRow> = {}): AiChatRow {
  return AI_CHAT_ROW.parse({
    id: '11111111-1111-4111-8111-111111111111',
    profile_id: '22222222-2222-4222-8222-222222222222',
    kind: 'chat',
    title: 'Plan',
    icon: null,
    parent_id: null,
    helper_name: null,
    source_key: null,
    engine,
    tools: null,
    pinned: false,
    memory: true,
    archived_at: null,
    cost_micros: 0,
    last_message_at: '2026-10-17T10:00:00.000Z',
    created_at: '2026-10-17T09:00:00.000Z',
    updated_at: '2026-10-17T10:00:00.000Z',
    ...change,
  });
}

const CLAUDE_ENGINE = { kind: 'claude', device_id: DEVICE, model: 'opus' } as const;
const PLAIN_ENGINE = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '0e000000-0000-4000-8000-0000000000a1',
  model: 'x',
  effort: null,
} as const;

const SOURCES = { previews: new Map(), working: new Map(), plugins: new Map() };

describe('Claude rows use the same row model as normal chats', () => {
  it('an app Claude chat and a normal chat carry the same fields', () => {
    const claude = entries.entryOf(chat(CLAUDE_ENGINE), SOURCES);
    const plain = entries.entryOf(chat(PLAIN_ENGINE), SOURCES);
    expect(Object.keys(claude).sort()).toEqual(Object.keys(plain).sort());
  });

  it('unread and needs-you counts come from the chat row for Claude chats', () => {
    const entry = entries.entryOf(
      chat(CLAUDE_ENGINE, { unread_count: 3, pending_requests: 2 }),
      SOURCES,
    );
    expect(entry).toMatchObject({ unread: 3, requests: 2 });
    expect(status.rowLineOf(entry, 0, 0)).toEqual({ kind: 'needs', count: 2 });
  });

  it('working and failed lines are the same for Claude chats as for normal chats', () => {
    const work = { phase: 'Working', step: 'Reading' };
    const working = new Map([[chat(CLAUDE_ENGINE).id, { work }]]);
    const entry = entries.entryOf(chat(CLAUDE_ENGINE), { ...SOURCES, working });
    expect(status.rowLineOf(entry, 0, 0)).toEqual({ kind: 'working', work });
    const previews = new Map([
      [
        chat(CLAUDE_ENGINE).id,
        { text: 'x', at: 'a', speaker: null, failure: { sent: true, reason: 'Offline' } },
      ],
    ]);
    const failed = entries.entryOf(chat(CLAUDE_ENGINE), { ...SOURCES, previews });
    expect(status.rowLineOf(failed, 0, 0)).toEqual({
      kind: 'failed',
      sent: true,
      reason: 'Offline',
    });
  });

  it('the avatar of every Claude row is the computer it runs on', () => {
    const app = entries.entryOf(chat(CLAUDE_ENGINE), SOURCES);
    const plain = entries.entryOf(chat(PLAIN_ENGINE), SOURCES);
    expect(avatar.avatarOf(app)).toEqual({ kind: 'computer', computerId: DEVICE });
    expect(avatar.avatarOf(plain).kind).toBe('source');
  });
});
