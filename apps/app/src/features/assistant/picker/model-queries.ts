import { useRef } from 'react';
import { type InfiniteData, type UseQueryResult } from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_MODEL_CHOICE,
  type AiModelKind,
  type AiModelList,
  type AiModelSuggested,
} from '@smarteverything/domain';
import { listAiModels, readAiModel, suggestedAiModels, type ModelPageQuery } from '../../../api/ai';
import { aiModelsKeys } from '../../../queries/keys';
import { choiceOf, type ModelChoice } from './model-choice';
import { background } from '@smarteverything/logging';

export function useSuggestedModels(
  kind: AiModelKind,
  current: string | null,
  enabled = true,
): UseQueryResult<AiModelSuggested> {
  const parsed = current === null ? null : AI_MODEL_CHOICE.safeParse(current);
  const choice = parsed?.success === true ? parsed.data : null;
  return useScreenQuery({
    queryKey: aiModelsKeys.suggested(kind, choice),
    queryFn: () => suggestedAiModels(kind, choice),
    enabled,
  });
}

export interface ModelPages {
  readonly models: readonly ModelChoice[];
  readonly total: number | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

function pagesOf(pages: readonly AiModelList[] | undefined): readonly ModelChoice[] {
  return (pages ?? []).flatMap((page) =>
    page.models.filter((row) => row.gone_at === null).map(choiceOf),
  );
}

export function useModelPages(
  key: readonly unknown[],
  query: Omit<ModelPageQuery, 'cursor'>,
  enabled: boolean,
): ModelPages {
  const fetching = useRef(false);
  const result = useScreenInfiniteQuery<
    AiModelList,
    Error,
    InfiniteData<AiModelList, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      listAiModels(pageParam === null ? query : { ...query, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? null,
    enabled,
  });
  return {
    models: pagesOf(result.data?.pages),
    total: result.data?.pages[0]?.total ?? null,
    loading: result.isPending || result.isFetchingNextPage,
    error: result.error,
    more:
      result.hasNextPage && !result.isFetchingNextPage
        ? (): void => {
            if (fetching.current) return;
            fetching.current = true;
            background(
              result.fetchNextPage({ cancelRefetch: false }).finally(() => {
                fetching.current = false;
              }),
              'next_page.fetch_failed',
            );
          }
        : null,
    retry: (): void => {
      background(result.refetch(), 'result.refetch_failed');
    },
  };
}

export function useModelRow(id: string | null): UseQueryResult<ModelChoice> {
  return useScreenQuery({
    queryKey: aiModelsKeys.one(id ?? ''),
    queryFn: async () => choiceOf(await readAiModel(id ?? '')),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
