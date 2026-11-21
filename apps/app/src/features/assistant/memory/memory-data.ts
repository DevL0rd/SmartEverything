import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  AI_MEMORY_LIST,
  API_ENDPOINTS as E,
  type AiMemory,
  type AiMemoryList,
  type AiMemoryScope,
  type AiMemorySettingsChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { connectionState } from '../../../api/connection/connection';
import { api, useConnection } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { writeShownQuery } from '../../../queries/shown-query';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

const log = new Logger('app.memory');

function principalKey(state: StoreState): string | null {
  const client = state.session?.client;
  return client === undefined ? null : JSON.stringify([client.id, client.profile_id, client.role]);
}

class MemorySessionChangedError extends Error {
  override readonly name = 'MemorySessionChangedError';

  constructor() {
    super('The home or profile changed. Open Memories again before making changes.');
  }
}

interface MemorySession {
  readonly key: string;
  readonly ready: boolean;
  readonly assertCurrent: () => void;
}

export function useMemorySession(): MemorySession {
  const connection = useConnection();
  const store = useEntityStore();
  const principal = useStoreSelector(principalKey);
  const ready = connection.status === 'paired' && principal !== null;
  const url = connection.status === 'paired' ? connection.connection.url : null;
  return {
    key: JSON.stringify([url, principal]),
    ready,
    assertCurrent: (): void => {
      if (!ready || connectionState.get() !== connection || principalKey(store.get()) !== principal)
        throw new MemorySessionChangedError();
    },
  };
}

function queryKeyOf(key: string): readonly ['window', 'ai', 'memory', string] {
  return ['window', 'ai', 'memory', key];
}

export function useMemoryList(session: MemorySession): UseQueryResult<AiMemoryList> {
  return useScreenQuery({
    queryKey: queryKeyOf(session.key),
    enabled: session.ready,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      session.assertCurrent();
      const list = await api().call(E.listAiMemories, {}, { signal });
      session.assertCurrent();
      return list;
    },
  });
}

export interface MemoryActions {
  readonly add: (scope: AiMemoryScope, text: string) => Promise<void>;
  readonly change: (memory: AiMemory, text: string) => Promise<void>;
  readonly remove: (memory: AiMemory) => Promise<void>;
  readonly forget: (scope: AiMemoryScope) => Promise<number>;
  readonly settings: (change: AiMemorySettingsChange) => Promise<void>;
}

function refreshed(client: QueryClient, key: string): Promise<void> {
  return client.invalidateQueries({ queryKey: queryKeyOf(key), exact: true });
}

async function shownWrite(
  client: QueryClient,
  key: string,
  change: (list: AiMemoryList) => AiMemoryList,
  send: () => Promise<unknown>,
): Promise<void> {
  try {
    await writeShownQuery(client, {
      event: 'memory.change',
      key: queryKeyOf(key),
      schema: AI_MEMORY_LIST,
      change,
      send,
    });
  } finally {
    await refreshed(client, key);
  }
}

function withMemory(memory: AiMemory, next: AiMemory | null): (list: AiMemoryList) => AiMemoryList {
  return (list) => ({
    ...list,
    memories: list.memories.flatMap((entry) => {
      if (entry.id !== memory.id) return [entry];
      return next === null ? [] : [next];
    }),
  });
}

export function useMemoryActions(): MemoryActions {
  const client = useQueryClient();
  const session = useMemorySession();
  return {
    add: async (scope, text): Promise<void> => {
      session.assertCurrent();
      await api().call(E.addAiMemory, { body: { scope, text } });
      log.info('memory.added', { scope });
      await refreshed(client, session.key);
    },
    change: async (memory, text): Promise<void> => {
      session.assertCurrent();
      const next = { ...memory, text, updated_at: new Date().toISOString() };
      await shownWrite(client, session.key, withMemory(memory, next), () =>
        api().call(E.changeAiMemory, { params: { memoryId: memory.id }, body: { text } }),
      );
      log.info('memory.changed', { scope: memory.scope });
    },
    remove: async (memory): Promise<void> => {
      session.assertCurrent();
      await shownWrite(client, session.key, withMemory(memory, null), () =>
        api().call(E.removeAiMemory, { params: { memoryId: memory.id } }),
      );
      log.info('memory.removed', { scope: memory.scope });
    },
    forget: async (scope): Promise<number> => {
      session.assertCurrent();
      const { removed } = await api().call(E.forgetAiMemories, { query: { scope } });
      log.info('memory.forgotten', { scope, removed });
      await refreshed(client, session.key);
      return removed;
    },
    settings: async (change): Promise<void> => {
      session.assertCurrent();
      await shownWrite(
        client,
        session.key,
        (list) => ({
          ...list,
          settings: {
            enabled: change.enabled ?? list.settings.enabled,
            prompt_chars: change.prompt_chars ?? list.settings.prompt_chars,
          },
        }),
        () => api().call(E.changeAiMemorySettings, { body: change }),
      );
    },
  };
}
