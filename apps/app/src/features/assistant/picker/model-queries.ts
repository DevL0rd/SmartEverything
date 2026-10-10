import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  AI_MODEL_CHOICE,
  type AiModelKind,
  type AiModelList,
  type AiModelSuggested,
  type AiProviderCount,
} from '@smarteverything/domain';
import {
  listAiModelProviders,
  listAiModels,
  readAiModel,
  suggestedAiModels,
  type ModelPageQuery,
} from '../../../api/ai';
import { aiModelsKeys } from '../../../queries/keys';
import { choiceOf, type ModelChoice } from './model-choice';

const PAGES_MAX = 20;

export function useSuggestedModels(
  kind: AiModelKind,
  current: string | null,
  enabled = true,
): UseQueryResult<AiModelSuggested> {
  const parsed = current === null ? null : AI_MODEL_CHOICE.safeParse(current);
  const choice = parsed?.success === true ? parsed.data : null;
  return useQuery({
    queryKey: aiModelsKeys.suggested(kind, choice),
    queryFn: () => suggestedAiModels(kind, choice),
    enabled,
  });
}

export function useModelProviders(
  kind: AiModelKind,
  enabled: boolean,
): UseQueryResult<AiProviderCount[]> {
  return useQuery({
    queryKey: aiModelsKeys.providers(kind),
    queryFn: () => listAiModelProviders(kind),
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
  const result = useInfiniteQuery<
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
    getNextPageParam: (last, all) => (all.length >= PAGES_MAX ? null : (last.next_cursor ?? null)),
    enabled,
  });
  return {
    models: pagesOf(result.data?.pages),
    total: result.data?.pages[0]?.total ?? null,
    loading: result.isPending || result.isFetchingNextPage,
    error: result.error,
    more:
      result.hasNextPage && !result.isFetchingNextPage
        ? (): void => void result.fetchNextPage()
        : null,
    retry: (): void => {
      void result.refetch();
    },
  };
}

export function useModelRow(id: string | null): UseQueryResult<ModelChoice> {
  return useQuery({
    queryKey: aiModelsKeys.one(id ?? ''),
    queryFn: async () => choiceOf(await readAiModel(id ?? '')),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
