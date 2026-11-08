import { skipToken, type InfiniteData, type UseQueryResult } from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import type {
  PluginOption,
  PluginOptionPage,
  PluginOptionQuery,
  PluginRow,
} from '@smarteverything/domain';
import { readPluginOptions } from '../../../api/plugin-admin';
import { pluginOptionsKey } from '../../../queries/keys';
import { background } from '@smarteverything/logging';
import { readChosen } from '../model/chosen-pages';

const CHOSEN_STALE_MS = 30_000;

export interface OptionFeed {
  readonly key: readonly string[];
  readonly read: (query: PluginOptionQuery) => Promise<PluginOptionPage>;
}

export function pluginOptionFeed(row: PluginRow, source: string): OptionFeed {
  return {
    key: pluginOptionsKey(row.id, source, []),
    read: (query) => readPluginOptions(row.id, source, query),
  };
}

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

export function useOptionPages(feed: OptionFeed, search: string, enabled: boolean): OptionPages {
  const result = useScreenInfiniteQuery<
    PluginOptionPage,
    Error,
    InfiniteData<PluginOptionPage, string | null>,
    readonly string[],
    string | null
  >({
    queryKey: [...feed.key, 'page', search],
    queryFn: ({ pageParam }) =>
      feed.read({
        ...(search === '' ? {} : { q: search }),
        ...(pageParam === null ? {} : { after: pageParam }),
      }),
    initialPageParam: null,
    getNextPageParam: (last) => (last.state === 'ready' ? last.next : null),
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
        ? (): void => {
            background(result.fetchNextPage(), 'next_page.fetch_failed');
          }
        : null,
    retry: (): void => {
      background(result.refetch(), 'result.refetch_failed');
    },
  };
}

export function useChosenOptions(
  feed: OptionFeed | null,
  ids: readonly string[],
): UseQueryResult<PluginOptionPage> {
  return useScreenQuery({
    queryKey: [...(feed?.key ?? []), 'chosen', ids.join(',')],
    queryFn:
      feed === null || ids.length === 0
        ? skipToken
        : (): Promise<PluginOptionPage> => readChosen(feed.read, ids),
    staleTime: CHOSEN_STALE_MS,
  });
}

export function chosenLabels(
  result: UseQueryResult<PluginOptionPage>,
): ReadonlyMap<string, PluginOption> {
  const page = result.data;
  return new Map(page?.state === 'ready' ? page.options.map((option) => [option.id, option]) : []);
}
