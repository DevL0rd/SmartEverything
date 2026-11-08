import { ASSISTANT_MESSAGE_ROW, type AssistantMessageRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from 'expo-router';
import { pendingConfirm, settleConfirm } from '../../../components/confirm-store';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';

const removed: string[] = [];

const api = vi.hoisted(() => ({ latestChatMessages: vi.fn(), removeAiChat: vi.fn() }));
api.removeAiChat.mockImplementation((id: string) => {
  removed.push(id);
  return Promise.resolve();
});

vi.mock('../../../api/ai', () => ({
  branchAiChat: vi.fn(),
  latestChatMessages: api.latestChatMessages,
  removeAiChat: api.removeAiChat,
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('./chat-list-toggle', () => ({ closeChatListSlideOver: vi.fn() }));
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
    quote: null,
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
    removed.length = 0;
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

describe('deleting the inactive agents', () => {
  const idle = (id: string): ChatEntry => ({
    id,
    kind: 'subagent',
    title: id,
    source: APP_SOURCE,
    at: '2026-11-05T09:00:00.000Z',
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: null,
    computerId: null,
    line: { kind: 'empty' },
  });

  const working = (id: string): ChatEntry => ({
    ...idle(id),
    line: { kind: 'working', work: { phase: 'Working', step: null } },
  });

  it('deletes the idle agents and keeps the working one', async () => {
    const { deleteInactiveAgents } = await import('./row-actions');
    const onDeleted = vi.fn();
    const pending = deleteInactiveAgents([working('busy'), idle('idle')], onDeleted);
    const request = pendingConfirm.get();
    settleConfirm(true);
    await pending;
    expect(removed).toEqual(['idle']);
    expect(api.removeAiChat).toHaveBeenCalledWith('idle', { inactiveHelper: true });
    expect(onDeleted).toHaveBeenCalledWith('idle');
    expect(request).toMatchObject({
      title: 'Delete 1 completed helper chat?',
      confirmLabel: 'Delete 1 chat',
    });
  });

  it('uses guarded deletion after confirmation and keeps a helper the hub finds active', async () => {
    const { deleteInactiveAgents } = await import('./row-actions');
    const onDeleted = vi.fn();
    const pending = deleteInactiveAgents([idle('starts-during-confirmation')], onDeleted);
    expect(pendingConfirm.get()?.title).toContain('completed helper');
    api.removeAiChat.mockRejectedValueOnce(new Error('This child conversation is still working.'));
    settleConfirm(true);
    await pending;
    expect(api.removeAiChat).toHaveBeenLastCalledWith('starts-during-confirmation', {
      inactiveHelper: true,
    });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('removes completed children before their parents so the bulk calls do not overlap', async () => {
    const { deleteInactiveAgents } = await import('./row-actions');
    const parent = idle('parent');
    const child = { ...idle('nested'), parentId: parent.id };
    const onDeleted = vi.fn();
    const pending = deleteInactiveAgents([parent, child], onDeleted);
    settleConfirm(true);
    await pending;
    expect(onDeleted.mock.calls).toEqual([['nested'], ['parent']]);
  });
});

describe('the sidebar chat actions', () => {
  it('opens Rename without offering the removed details panel', async () => {
    const { menuOf } = await import('./row-actions');
    const entry = { id: CHAT, title: 'Garden plan', pinned: false, archived: false, unread: 0 };
    const menu = menuOf(entry, { onDeleted: vi.fn(), storedMessages: () => [] });
    menu.find((item) => item.label === 'Rename')?.onPress();
    expect(menu.some((item) => item.label === 'Chat details')).toBe(false);
    expect(router.push).toHaveBeenNthCalledWith(1, {
      pathname: '/assistant/chat/[chatId]',
      params: { chatId: CHAT, operation: 'rename' },
    });
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
