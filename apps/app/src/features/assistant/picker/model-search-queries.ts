import { Logger, background } from '@smarteverything/logging';
import { useEffect, useRef, useState } from 'react';
import {
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import {
  ApiError,
  type AiModelKind,
  type AiModelSearch,
  type AiModelSearchMetrics,
  type AiProviderCount,
} from '@smarteverything/domain';
import { searchAiModels, listAiModelProviders } from '../../../api/ai';
import { aiModelsKeys } from '../../../queries/keys';
import { choiceOf } from './model-choice';
import type { ModelPages } from './model-queries';
import type { SearchQuery } from './model-search-filters';
import { ModelSearchSessionChangedError, type PickerSession } from './model-search-session';

const log = new Logger('app.models');
export interface SearchModelPages extends ModelPages {
  readonly snapshot: AiModelSearch | null;
  readonly metrics: Readonly<Record<string, AiModelSearchMetrics>>;
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
    background(client.resetQueries({ queryKey: key, exact: true }), 'queries.reset_failed');
  }, [client, id, key, result]);
  return updated === id;
}
function useSearchResult(
  query: SearchQuery,
  session: PickerSession,
  enabled: boolean,
): SearchResult {
  return useScreenInfiniteQuery<
    AiModelSearch,
    Error,
    InfiniteData<AiModelSearch, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: aiModelsKeys.detailed(session.key, query),
    queryFn: async ({ pageParam }) => {
      if (!session.valid()) {
        log.debug('models.search_stale', { phase: 'before' });
        throw new ModelSearchSessionChangedError();
      }
      const startedAt = Date.now();
      let page: AiModelSearch;
      try {
        page = await searchAiModels(pageParam === null ? query : { ...query, cursor: pageParam });
      } catch (error) {
        log.warn('models.search_failed', {
          paged: pageParam !== null,
          error: error instanceof Error ? error.name : typeof error,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      log.debug('models.search_finished', () => ({
        paged: pageParam !== null,
        models: page.models.length,
        more: page.next_cursor !== null,
        durationMs: Date.now() - startedAt,
      }));
      if (!session.valid()) {
        log.debug('models.search_stale', { phase: 'after' });
        throw new ModelSearchSessionChangedError();
      }
      return page;
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: enabled && session.ready,
    retry: (count, error) =>
      !(error instanceof ApiError || error instanceof ModelSearchSessionChangedError) && count < 1,
  });
}
const NO_PAGES: readonly AiModelSearch[] = [];
function metricsOf(
  pages: readonly AiModelSearch[],
): Readonly<Record<string, AiModelSearchMetrics>> {
  return Object.fromEntries(pages.flatMap((page) => Object.entries(page.metrics)));
}
function retrySearch(
  result: SearchResult,
  key: readonly unknown[],
  client: ReturnType<typeof useQueryClient>,
): void {
  if (changedCursor(result)) {
    background(client.resetQueries({ queryKey: key, exact: true }), 'queries.reset_failed');
    return;
  }
  if (result.isFetchNextPageError) {
    background(result.fetchNextPage({ cancelRefetch: false }), 'next_page.fetch_failed');
    return;
  }
  background(result.refetch(), 'result.refetch_failed');
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
  const pages = result.data?.pages ?? NO_PAGES;
  const snapshot = pages[0] ?? null;
  return {
    models: pages.flatMap((page) =>
      page.models.filter((model) => model.gone_at === null).map(choiceOf),
    ),
    total: snapshot?.total ?? null,
    snapshot,
    metrics: metricsOf(pages),
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
            background(
              result.fetchNextPage({ cancelRefetch: false }).finally(() => {
                fetching.current = false;
              }),
              'next_page.fetch_failed',
            );
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
  return useScreenQuery({
    queryKey: [...aiModelsKeys.providers(kind), session.key],
    enabled: enabled && session.ready,
    queryFn: async () => {
      const startedAt = Date.now();
      const rows = await listAiModelProviders(kind);
      log.debug('models.makers_listed', () => ({
        kind,
        makers: rows.length,
        durationMs: Date.now() - startedAt,
      }));
      if (!session.valid()) {
        log.debug('models.search_stale', { phase: 'makers' });
        throw new ModelSearchSessionChangedError();
      }
      return rows;
    },
  });
}
