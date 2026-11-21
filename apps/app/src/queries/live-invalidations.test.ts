import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  AI_CHAT_ROW,
  AI_USAGE_ROW,
  type LiveChange,
  type LiveWireChange,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshChatMeterHistory } from './chat-meter-history';
import { AI_USAGE_PREFIX, chatMeterHistoryKey, OPENROUTER_ACCOUNT_KEY } from './keys';
import { wired } from '../test-support/live-wire';

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
    applyToWindows(client, [mapChange, removal], wired([mapChange, removal]));
    expect(applyHomeMapChanges).toHaveBeenCalledExactlyOnceWith(
      client,
      wired([mapChange, removal]),
    );
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
    applyToWindows(
      client,
      [updateChat({ ...chat, context_percent: 0 })],
      wired([updateChat({ ...chat, context_percent: 0 })]),
    );
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it('refreshes meter histories absent from replay when a snapshot synchronizes', () => {
    const client = seededClient();
    const replay = [updateChat({ ...chat, context_percent: 75 })];
    refreshChatMeterHistory(client, replay, wired(replay));
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
      applyToWindows(
        client,
        [updateChat({ ...chat, context_percent: 75 })],
        wired([updateChat({ ...chat, context_percent: 75 })]),
      );
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
    applyToWindows(
      client,
      [updateChat({ ...chat, title: 'Renamed' }), updateUsage({ ...usage, cost_micros: 120 })],
      wired([
        updateChat({ ...chat, title: 'Renamed' }),
        updateUsage({ ...usage, cost_micros: 120 }),
      ]),
    );
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it('refreshes cache history when new usage arrives or a reading changes chats', () => {
    const client = seededClient();
    applyToWindows(
      client,
      [
        {
          type: 'change',
          table: 'ai_usage',
          operation: 'INSERT',
          record: usage,
          oldRecord: null,
          seq: 1,
        },
      ],
      wired([
        {
          type: 'change',
          table: 'ai_usage',
          operation: 'INSERT',
          record: usage,
          oldRecord: null,
          seq: 1,
        },
      ]),
    );
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);

    client.setQueryData(key, []);
    applyToWindows(
      client,
      [updateUsage({ ...usage, chat_id: OTHER_CHAT_ID })],
      wired([updateUsage({ ...usage, chat_id: OTHER_CHAT_ID })]),
    );
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(true);
  });
});

describe('AI usage live changes', () => {
  const VISION_CALLS = 44;
  const CALL_GAP_MS = 1360;
  const RECONCILE_AFTER_MS = 400;
  const READ_MS = 800;
  const USAGE_KEYS = [
    [...AI_USAGE_PREFIX, 'summary'],
    [...AI_USAGE_PREFIX, 'totals'],
    [...AI_USAGE_PREFIX, 'openrouter-utc-day'],
    [...AI_USAGE_PREFIX, 'ledger'],
    [...AI_USAGE_PREFIX, 'budget'],
    [...AI_USAGE_PREFIX, 'choices'],
  ] as const;

  interface Reads {
    readonly started: Map<string, number>;
    readonly aborted: Map<string, number>;
    readonly stop: () => void;
  }

  function watchedReads(client: QueryClient): Reads {
    const started = new Map<string, number>();
    const aborted = new Map<string, number>();
    const bump = (counts: Map<string, number>, name: string): void => {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    };
    const stops = [...USAGE_KEYS, OPENROUTER_ACCOUNT_KEY].map((queryKey) => {
      const name = queryKey.join('/');
      const observer = new QueryObserver(client, {
        queryKey,
        queryFn: ({ signal }): Promise<number> => {
          bump(started, name);
          signal.addEventListener('abort', () => {
            bump(aborted, name);
          });
          return new Promise((resolve) => setTimeout(resolve, READ_MS, 1));
        },
      });
      return observer.subscribe(() => undefined);
    });
    return {
      started,
      aborted,
      stop: (): void => {
        for (const stop of stops) stop();
      },
    };
  }

  function visionInsert(index: number): LiveChange {
    return {
      type: 'change',
      table: 'ai_usage',
      operation: 'INSERT',
      record: {
        ...usage,
        id: `a1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`,
        chat_id: null,
        work: 'photos',
        cost_state: 'reported',
      },
      oldRecord: null,
      seq: index * 2,
    };
  }

  function reconciled(index: number): LiveWireChange {
    return {
      type: 'change',
      table: 'ai_usage',
      operation: 'UPDATE',
      key: { id: `a1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}` },
      set: { cost_state: 'reconciled' },
      seq: index * 2 + 1,
    };
  }

  async function visionMinute(client: QueryClient): Promise<void> {
    for (let index = 1; index <= VISION_CALLS; index += 1) {
      const insert = visionInsert(index);
      applyToWindows(client, [insert], wired([insert]));
      await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS);
      applyToWindows(client, [], [reconciled(index)]);
      await vi.advanceTimersByTimeAsync(CALL_GAP_MS - RECONCILE_AFTER_MS);
    }
    await vi.advanceTimersByTimeAsync(30_000);
  }

  function total(counts: Map<string, number>, names: readonly string[]): number {
    return names.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    return (): void => {
      vi.useRealTimers();
    };
  });

  it('reads the costs a few times and the OpenRouter account never during a minute of vision usage', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const reads = watchedReads(client);
    try {
      await vi.advanceTimersByTimeAsync(READ_MS);
      await visionMinute(client);
      const usageNames = USAGE_KEYS.map((key) => key.join('/'));
      const account = OPENROUTER_ACCOUNT_KEY.join('/');
      expect({
        usageReads: total(reads.started, usageNames),
        usageCancelled: total(reads.aborted, usageNames),
        accountReads: reads.started.get(account) ?? 0,
      }).toEqual({ usageReads: 42, usageCancelled: 0, accountReads: 1 });
    } finally {
      reads.stop();
    }
  });

  it('refreshes the costs once the usage burst settles', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const reads = watchedReads(client);
    try {
      await vi.advanceTimersByTimeAsync(READ_MS);
      const insert = visionInsert(1);
      applyToWindows(client, [insert], wired([insert]));
      applyToWindows(client, [], [reconciled(1)]);
      expect(total(reads.started, [USAGE_KEYS[0].join('/')])).toBe(1);
      await vi.advanceTimersByTimeAsync(READ_MS * 4);
      expect(total(reads.started, [USAGE_KEYS[0].join('/')])).toBe(2);
      expect(reads.started.get(OPENROUTER_ACCOUNT_KEY.join('/'))).toBe(1);
    } finally {
      reads.stop();
    }
  });
});
