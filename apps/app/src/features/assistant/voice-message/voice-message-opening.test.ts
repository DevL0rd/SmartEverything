import { AI_CHAT_ROW } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { RULES } from '../../../store/table-rules';
import { upsert } from '../../../store/table-ops';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), open: vi.fn(), assertCurrent: vi.fn() }));
vi.mock('expo-router', () => ({ router: { replace: mocks.replace } }));
vi.mock('../../../api/ai', () => ({ openConversationChat: mocks.open }));
vi.mock('../../../store/assistant-response-style', () => ({
  captureAssistantWrite: vi.fn(),
  assertAssistantWriteCurrent: mocks.assertCurrent,
}));

const { recordInConversation } = await import('./open-voice-conversation');
const { claimVoiceMessage, showChatOnScreen } = await import('./voice-request');

const CHAT = AI_CHAT_ROW.parse({
  id: '0e000000-0000-4000-8000-0000000000c1',
  profile_id: '0e000000-0000-4000-8000-000000000001',
  kind: 'chat',
  title: 'Assistant',
  icon: null,
  parent_id: null,
  source_key: 'conversation',
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model: 'fixture',
    model_route_id: '0e000000-0000-4000-8000-000000000002',
  },
  tools: null,
  pinned: false,
  memory: false,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: '2026-11-08T00:00:00Z',
  updated_at: '2026-11-08T00:00:00Z',
});

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.open.mockReset().mockResolvedValue(CHAT);
  mocks.assertCurrent.mockReset();
  const hide = showChatOnScreen(CHAT.id);
  hide();
});

describe('opening the conversation chat for a voice message', () => {
  it('makes the returned chat readable before navigating on the first invocation', async () => {
    const store = new EntityStore();
    expect(store.get().tables.ai_chats.byId[CHAT.id]).toBeUndefined();
    mocks.replace.mockImplementation(() => {
      expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(CHAT);
    });
    await recordInConversation(store, () => true);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: '/assistant/chat/[chatId]',
      params: { chatId: CHAT.id },
    });
    const hide = showChatOnScreen(CHAT.id);
    expect(claimVoiceMessage(CHAT.id)).toBe(true);
    hide();
  });

  it('retains a newer live row that arrived before the HTTP response', async () => {
    const store = new EntityStore();
    const newer = { ...CHAT, title: 'Updated while opening' };
    store.update((state) => ({
      ...state,
      tables: { ...state.tables, ai_chats: upsert(state.tables.ai_chats, newer, RULES.ai_chats) },
    }));
    await recordInConversation(store, () => true);
    expect(store.get().tables.ai_chats.byId[CHAT.id]).toBe(newer);
  });

  it('does not mutate, request or navigate after the opening leaves the screen', async () => {
    const store = new EntityStore();
    let complete: (value: typeof CHAT) => void = () => undefined;
    mocks.open.mockReturnValue(
      new Promise<typeof CHAT>((resolve) => {
        complete = resolve;
      }),
    );
    let current = true;
    const opening = recordInConversation(store, () => current);
    current = false;
    complete(CHAT);
    await opening;
    expect(store.get().tables.ai_chats.rows).toEqual([]);
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('rejects a response belonging to an authority that changed while opening', async () => {
    const store = new EntityStore();
    mocks.assertCurrent.mockImplementation(() => {
      throw new Error('Profile changed');
    });
    await expect(recordInConversation(store, () => true)).rejects.toThrow('Profile changed');
    expect(store.get().tables.ai_chats.rows).toEqual([]);
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps a failed chat request on the opening screen', async () => {
    mocks.open.mockRejectedValue(new Error('Offline'));
    await expect(recordInConversation(new EntityStore(), () => true)).rejects.toThrow('Offline');
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
