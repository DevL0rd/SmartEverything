import { AI_CHAT_ROW, type AiChatRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { chatAfter } from './chat-prediction';

const ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const AT = new Date('2026-11-21T10:00:00.000Z');

const CHAT: AiChatRow = AI_CHAT_ROW.parse({
  id: ID,
  profile_id: 'a1b2c3d4-0000-4000-8000-000000000002',
  kind: 'chat',
  title: 'Garden plan',
  icon: null,
  parent_id: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: 'a1b2c3d4-0000-4000-8000-000000000003',
    model: 'fixture/model',
  },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  unread_count: 3,
  last_message_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
});

function storeWith(row: AiChatRow): EntityStore {
  const store = new EntityStore();
  store.update(liveRowEdit('ai_chats', row.id, null, row).apply);
  return store;
}

describe('a predicted chat change', () => {
  it('shows a new title, pin and archive at once', () => {
    const next = chatAfter(CHAT, { title: 'Planters', pinned: true, archived: true }, AT);
    expect(next).toMatchObject({ title: 'Planters', pinned: true, archived_at: AT.toISOString() });
  });

  it('clears the unread count when marked read and keeps one unread when marked unread', () => {
    expect(chatAfter(CHAT, { read: true }, AT)).toMatchObject({
      read_at: AT.toISOString(),
      unread_count: 0,
    });
    expect(chatAfter({ ...CHAT, unread_count: 0 }, { read: false }, AT).unread_count).toBe(1);
  });

  it('puts the stored chat back when the hub refuses the rename', async () => {
    const store = storeWith(CHAT);
    const edit = liveRowEdit('ai_chats', ID, CHAT, chatAfter(CHAT, { title: 'Planters' }, AT));
    await expect(
      writeOptimistically(store, {
        event: 'chat.update',
        edits: [edit],
        send: () => {
          expect(store.get().tables.ai_chats.byId[ID]?.title).toBe('Planters');
          return Promise.reject(new Error('refused'));
        },
      }),
    ).rejects.toThrow('refused');
    expect(store.get().tables.ai_chats.byId[ID]?.title).toBe('Garden plan');
  });
});
