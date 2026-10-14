import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  ApiError,
  type AiModelKind,
  type AiModelSearch,
  type AiProviderCount,
} from '@smarteverything/domain';
import { searchAiModels, listAiModelProviders } from '../../../api/ai';
import { aiModelsKeys } from '../../../queries/keys';
import { choiceOf } from './model-choice';
import type { ModelPages } from './model-queries';
import type { SearchQuery } from './model-search-filters';
import { ModelSearchSessionChangedError, type PickerSession } from './model-search-session';
export interface SearchModelPages extends ModelPages {
  readonly snapshot: AiModelSearch | null;
  readonly updated: boolean;
  readonly pending: boolean;
}
type SearchResult = UseInfiniteQueryResult<InfiniteData<AiModelSearch, string | null>>;
function changedCursor(result: SearchResult): boolean {
  return (
    result.isFetchNextPageError &&
    result.error instanceof ApiError &&
    result.error.code === 'invalid_request' &&
    result.error.message === 'This model search changed. Start again from the first page.'
  );
}
function useCursorRecovery(result: SearchResult, key: readonly unknown[]): boolean {
  const client = useQueryClient();
  const restarts = useRef(new Set<string>());
  const [updated, setUpdated] = useState<string | null>(null);
  const id = JSON.stringify(key);
  useEffect(() => {
    if (!changedCursor(result) || restarts.current.has(id)) return;
    restarts.current.add(id);
    setUpdated(id);
    void client.resetQueries({ queryKey: key, exact: true });
  }, [client, id, key, result]);
  return updated === id;
}
function useSearchResult(
  query: SearchQuery,
  session: PickerSession,
  enabled: boolean,
): SearchResult {
  return useInfiniteQuery<
    AiModelSearch,
    Error,
    InfiniteData<AiModelSearch, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: aiModelsKeys.detailed(session.key, query),
    queryFn: async ({ pageParam }) => {
      if (!session.valid()) throw new ModelSearchSessionChangedError();
      const page = await searchAiModels(
        pageParam === null ? query : { ...query, cursor: pageParam },
      );
      if (!session.valid()) throw new ModelSearchSessionChangedError();
      return page;
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: enabled && session.ready,
    retry: (count, error) =>
      !(error instanceof ApiError || error instanceof ModelSearchSessionChangedError) && count < 1,
  });
}
function retrySearch(
  result: SearchResult,
  key: readonly unknown[],
  client: ReturnType<typeof useQueryClient>,
): void {
  if (changedCursor(result)) {
    void client.resetQueries({ queryKey: key, exact: true });
    return;
  }
  if (result.isFetchNextPageError) {
    void result.fetchNextPage({ cancelRefetch: false });
    return;
  }
  void result.refetch();
}
export function useSearchModelPages(
  query: SearchQuery,
  session: PickerSession,
  enabled: boolean,
): SearchModelPages {
  const client = useQueryClient();
  const fetching = useRef(false);
  const key = aiModelsKeys.detailed(session.key, query);
  const result = useSearchResult(query, session, enabled);
  const updated = useCursorRecovery(result, key);
  const snapshot = result.data?.pages[0] ?? null;
  return {
    models: (result.data?.pages ?? []).flatMap((page) =>
      page.models.filter((model) => model.gone_at === null).map(choiceOf),
    ),
    total: snapshot?.total ?? null,
    snapshot,
    updated,
    pending: result.isPending,
    loading: result.isFetching,
    error: result.error,
    more:
      !result.hasNextPage || result.isFetching || result.error !== null
        ? null
        : (): void => {
            if (fetching.current) return;
            fetching.current = true;
            void result.fetchNextPage({ cancelRefetch: false }).finally(() => {
              fetching.current = false;
            });
          },
    retry: (): void => {
      retrySearch(result, key, client);
    },
  };
}
export function useSearchMakers(
  kind: AiModelKind,
  session: PickerSession,
  enabled: boolean,
): UseQueryResult<AiProviderCount[]> {
  return useQuery({
    queryKey: [...aiModelsKeys.providers(kind), session.key],
    enabled: enabled && session.ready,
    queryFn: async () => {
      const rows = await listAiModelProviders(kind);
      if (!session.valid()) throw new ModelSearchSessionChangedError();
      return rows;
    },
  });
}
