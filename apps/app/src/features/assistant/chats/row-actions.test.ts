import { ASSISTANT_MESSAGE_ROW, type AssistantMessageRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ latestChatMessages: vi.fn(), removeAiChat: vi.fn() }));

vi.mock('../../../api/ai', () => ({
  branchAiChat: vi.fn(),
  latestChatMessages: api.latestChatMessages,
  removeAiChat: api.removeAiChat,
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('./chat-actions', () => ({
  deleteChat: vi.fn(),
  setChatArchived: vi.fn(),
  setChatPinned: vi.fn(),
  setChatRead: vi.fn(),
}));

const CHAT = '11111111-1111-4111-8111-111111111111';

function row(
  id: number,
  minute: number,
  state: AssistantMessageRow['state'],
  role: AssistantMessageRow['role'] = 'responder',
): AssistantMessageRow {
  const at = `2026-10-17T10:${String(minute).padStart(2, '0')}:00Z`;
  return ASSISTANT_MESSAGE_ROW.parse({
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    profile_id: '22222222-2222-4222-8222-222222222222',
    client_id: null,
    role,
    kind: 'text',
    author: 'x',
    text: 'hi',
    attachments: [],
    state,
    reason: null,
    steps: [],
    reply_to: null,
    chat_id: CHAT,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
  });
}

async function resolve(stored: readonly AssistantMessageRow[]): Promise<string | null> {
  const { resolveBranchPoint } = await import('./row-actions');
  return resolveBranchPoint(CHAT, stored);
}

describe('branch point for a chat row', () => {
  beforeEach(() => {
    api.latestChatMessages.mockReset();
  });

  it('uses the stored messages without asking the hub', async () => {
    const stored = [row(1, 1, 'answered'), row(2, 2, 'answered')];
    expect(await resolve(stored)).toBe(stored[1]?.id);
    expect(api.latestChatMessages).not.toHaveBeenCalled();
  });

  it('fetches the latest page when the store holds nothing for the chat', async () => {
    const fetched = [row(1, 1, 'answered'), row(2, 5, 'answered'), row(3, 9, 'working')];
    api.latestChatMessages.mockResolvedValue(fetched);
    expect(await resolve([])).toBe(fetched[1]?.id);
    expect(api.latestChatMessages).toHaveBeenCalledWith(CHAT);
  });

  it('skips queued and working rows and reports nothing when none is settled', async () => {
    api.latestChatMessages.mockResolvedValue([row(1, 1, 'queued'), row(2, 2, 'working')]);
    expect(await resolve([])).toBeNull();
  });
});
