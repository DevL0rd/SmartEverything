import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { AI_CHAT_ROW, AI_USAGE_ROW, type LiveChange } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshChatMeterHistory } from './chat-meter-history';
import { chatMeterHistoryKey } from './keys';

const applyHomeMapChanges = vi.fn();

vi.mock('../features/home-map/data/live', () => ({ applyHomeMapChanges }));

const { applyToWindows } = await import('./live-invalidations');

const AT = '2026-10-25T11:00:00.000Z';
const CHAT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_CHAT_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const PROFILE_ID = 'a1b2c3d4-0000-4000-8000-000000000003';

const mapChange: LiveChange = {
  type: 'change',
  table: 'home_maps',
  operation: 'UPDATE',
  record: { id: 'home', revision: 4, name: 'home', floors: 1, updatedAt: AT },
  oldRecord: null,
  seq: 4,
};

const removal: LiveChange = {
  type: 'change',
  table: 'home_maps',
  operation: 'DELETE',
  record: null,
  oldRecord: { id: 'home', revision: 4, name: 'home', floors: 1, updatedAt: AT },
  seq: 5,
};

describe('home map live changes', () => {
  beforeEach(() => {
    applyHomeMapChanges.mockClear();
  });

  it('hands revision and removal changes of home_maps to the home map refetch', () => {
    const client = new QueryClient();
    applyToWindows(client, [mapChange, removal]);
    expect(applyHomeMapChanges).toHaveBeenCalledExactlyOnceWith(client, [mapChange, removal]);
  });
});

const chat = AI_CHAT_ROW.parse({
  id: CHAT_ID,
  profile_id: PROFILE_ID,
  kind: 'chat',
  title: 'Chat',
  icon: null,
  parent_id: null,
  helper_name: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: OTHER_CHAT_ID,
    model_route_id: OTHER_CHAT_ID,
    model: 'model',
  },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  context_percent: 50,
  last_message_at: null,
  created_at: AT,
  updated_at: AT,
});

const usage = AI_USAGE_ROW.parse({
  id: 'a1b2c3d4-0000-4000-8000-000000000004',
  at: AT,
  profile_id: PROFILE_ID,
  client_id: null,
  chat_id: CHAT_ID,
  message_id: null,
  call_id: null,
  plugin_id: null,
  worker_id: null,
  source: 'openrouter',
  work: 'chat',
  model_id: null,
  generation_id: null,
  tokens_in: 100,
  tokens_out: 5,
  tokens_cached: 10,
  tokens_reasoning: 0,
  audio_in_ms: 0,
  audio_out_ms: 0,
  images: 0,
  video_ms: 0,
  cost_micros: 100,
  cost_state: 'estimated',
  meta: {},
});

function updateChat(record: typeof chat): LiveChange {
  return {
    type: 'change',
    table: 'ai_chats',
    operation: 'UPDATE',
    record,
    oldRecord: chat,
    seq: 1,
  };
}

function updateUsage(record: typeof usage): LiveChange {
  return {
    type: 'change',
    table: 'ai_usage',
    operation: 'UPDATE',
    record,
    oldRecord: usage,
    seq: 1,
  };
}

describe('chat meter history live changes', () => {
  const key = chatMeterHistoryKey(CHAT_ID);
  const otherKey = chatMeterHistoryKey(OTHER_CHAT_ID);

  function seededClient(): QueryClient {
    const client = new QueryClient();
    client.setQueryData(key, []);
    client.setQueryData(otherKey, []);
    return client;
  }

  it('invalidates only the chat whose measured context changed', () => {
    const client = seededClient();
    applyToWindows(client, [updateChat({ ...chat, context_percent: 0 })]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it('refreshes meter histories absent from replay when a snapshot synchronizes', () => {
    const client = seededClient();
    const replay = [updateChat({ ...chat, context_percent: 75 })];
    refreshChatMeterHistory(client, replay);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(true);
  });

  it('restarts the first history read when a new measurement arrives during it', async () => {
    const client = new QueryClient();
    const queryFn = vi
      .fn<(signal: AbortSignal) => Promise<readonly number[]>>()
      .mockReturnValueOnce(new Promise<readonly number[]>(() => undefined))
      .mockResolvedValue([75]);
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: ({ signal }): Promise<readonly number[]> => queryFn(signal),
    });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      applyToWindows(client, [updateChat({ ...chat, context_percent: 75 })]);
      await vi.waitFor(() => {
        expect(client.getQueryData(key)).toEqual([75]);
      });
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(queryFn.mock.calls[0]?.[0].aborted).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('keeps history cached through unrelated chat edits and cost corrections', () => {
    const client = seededClient();
    applyToWindows(client, [
      updateChat({ ...chat, title: 'Renamed' }),
      updateUsage({ ...usage, cost_micros: 120 }),
    ]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it('refreshes cache history when new usage arrives or a reading changes chats', () => {
    const client = seededClient();
    applyToWindows(client, [
      {
        type: 'change',
        table: 'ai_usage',
        operation: 'INSERT',
        record: usage,
        oldRecord: null,
        seq: 1,
      },
    ]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);

    client.setQueryData(key, []);
    applyToWindows(client, [updateUsage({ ...usage, chat_id: OTHER_CHAT_ID })]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(true);
  });
});
