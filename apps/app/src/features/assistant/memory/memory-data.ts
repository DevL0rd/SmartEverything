import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
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
      await api().call(E.changeAiMemory, { params: { memoryId: memory.id }, body: { text } });
      log.info('memory.changed', { scope: memory.scope });
      await refreshed(client, session.key);
    },
    remove: async (memory): Promise<void> => {
      session.assertCurrent();
      await api().call(E.removeAiMemory, { params: { memoryId: memory.id } });
      log.info('memory.removed', { scope: memory.scope });
      await refreshed(client, session.key);
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
      await api().call(E.changeAiMemorySettings, { body: change });
      await refreshed(client, session.key);
    },
  };
}
