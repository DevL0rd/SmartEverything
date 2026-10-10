import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PluginOption, PluginOptionPage, PluginRow } from '@smarteverything/domain';
import { readPluginOptions } from '../../../api/plugin-admin';
import { pluginOptionsKey } from '../../../queries/keys';

const PAGES_MAX = 40;
const CHOSEN_STALE_MS = 30_000;

export interface OptionPages {
  readonly options: readonly PluginOption[];
  readonly unavailable: string | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

function optionsOf(pages: readonly PluginOptionPage[] | undefined): readonly PluginOption[] {
  const found = (pages ?? []).flatMap((page) => (page.state === 'ready' ? page.options : []));
  return [...new Map(found.map((option) => [option.id, option])).values()];
}

function unavailableOf(pages: readonly PluginOptionPage[] | undefined): string | null {
  const first = pages?.[0];
  return first?.state === 'unavailable' ? first.message : null;
}

export function useOptionPages(
  row: PluginRow,
  source: string,
  search: string,
  enabled: boolean,
): OptionPages {
  const result = useInfiniteQuery<
    PluginOptionPage,
    Error,
    InfiniteData<PluginOptionPage, string | null>,
    readonly string[],
    string | null
  >({
    queryKey: pluginOptionsKey(row.id, source, ['page', search]),
    queryFn: ({ pageParam }) =>
      readPluginOptions(row.id, source, {
        ...(search === '' ? {} : { q: search }),
        ...(pageParam === null ? {} : { after: pageParam }),
      }),
    initialPageParam: null,
    getNextPageParam: (last, all) =>
      last.state === 'ready' && all.length < PAGES_MAX ? last.next : null,
    enabled,
    staleTime: 0,
  });
  return {
    options: optionsOf(result.data?.pages),
    unavailable: unavailableOf(result.data?.pages),
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

export function useChosenOptions(
  row: PluginRow,
  source: string,
  ids: readonly string[],
): UseQueryResult<PluginOptionPage> {
  const key = ids.join(',');
  return useQuery({
    queryKey: pluginOptionsKey(row.id, source, ['chosen', key]),
    queryFn: () => readPluginOptions(row.id, source, { ids: key }),
    enabled: ids.length > 0 && source !== '',
    staleTime: CHOSEN_STALE_MS,
  });
}

export function chosenLabels(
  result: UseQueryResult<PluginOptionPage>,
): ReadonlyMap<string, PluginOption> {
  const page = result.data;
  return new Map(page?.state === 'ready' ? page.options.map((option) => [option.id, option]) : []);
}
