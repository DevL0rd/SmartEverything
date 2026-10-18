import {
  ADGUARD_SNAPSHOT,
  QUERY_LOG_PAGE,
  type AdGuardQuery,
  type AdGuardSnapshot,
  type QueryLogPage,
  type QueryLogFilter,
} from '@smarteverything/domain';
import { type InfiniteData, type UseInfiniteQueryOptions } from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../../queries/use-screen-query';
import { z } from 'zod';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import { PLUGIN_PREFIX } from '../../queries/keys';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import { pluginLog } from '../shared/plugin-log';
import {
  parsePluginReply,
  readPluginTool,
  usePluginTool,
  type PluginToolRunner,
} from '../use-plugin-tool';
import { background } from '@smarteverything/logging';

export const ADGUARD_PLUGIN = 'adguard';

export function useAdGuardSnapshot(): PluginStream<AdGuardSnapshot> {
  return usePluginStream(ADGUARD_PLUGIN, 'adguard.snapshot', ADGUARD_SNAPSHOT);
}

export function useAdGuardTools(): PluginToolRunner {
  return usePluginTool(ADGUARD_PLUGIN);
}

const NOTICES: Readonly<
  Record<'not_set_up' | 'sign_in_needed' | 'connecting' | 'paused', PluginNoticeText>
> = {
  not_set_up: {
    tone: 'info',
    title: 'AdGuard Home isn’t set up',
    body: 'Block ads and trackers for every device at home. Add its address, user name and password, or copy them from Router Monitor.',
    settings: true,
  },
  sign_in_needed: {
    tone: 'warning',
    title: 'Add the AdGuard Home sign-in',
    body: 'AdGuard Home needs its user name and password before it can be read.',
    settings: true,
  },
  connecting: {
    tone: 'info',
    title: 'Connecting to AdGuard Home…',
    body: 'This takes a few seconds.',
    settings: false,
  },
  paused: {
    tone: 'warning',
    title: 'Monitoring is paused',
    body: 'Nothing is read from AdGuard Home.',
    settings: true,
  },
};

export function adguardNotice(snapshot: AdGuardSnapshot): PluginNoticeText | null {
  const connection = snapshot.connection;
  switch (connection.state) {
    case 'online':
      return null;
    case 'refused':
      return {
        tone: 'critical',
        title: 'AdGuard Home refused the sign-in',
        body: 'Check the user name and password in the plugin settings.',
        settings: true,
      };
    case 'unreachable':
      return {
        tone: 'critical',
        title: 'AdGuard Home can’t be reached',
        body: joinParts([connection.reason, `Offline since ${clock(connection.since)}`]),
        settings: true,
      };
    case 'not_set_up':
    case 'sign_in_needed':
    case 'connecting':
    case 'paused':
      return NOTICES[connection.state];
  }
}

const PAGE_REPLY = z.strictObject({ page: QUERY_LOG_PAGE });

const PAGE_SIZE = 50;

export const LOADED_PAGES = 6;

export interface QueryLogView {
  readonly entries: readonly AdGuardQuery[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly more: boolean;
  readonly loadOlder: () => void;
  readonly reload: () => void;
}

type QueryLogOptions = UseInfiniteQueryOptions<
  QueryLogPage,
  Error,
  InfiniteData<QueryLogPage, string | null>,
  readonly string[],
  string | null
>;

const FIRST_PAGE: string | null = null;

export function queryLogOptions(search: string, filter: QueryLogFilter): QueryLogOptions {
  return {
    queryKey: [...PLUGIN_PREFIX, ADGUARD_PLUGIN, 'log', filter, search],
    queryFn: async ({ pageParam }): Promise<QueryLogPage> => {
      const page = parsePluginReply(
        ADGUARD_PLUGIN,
        'query_log',
        PAGE_REPLY,
        await readPluginTool(ADGUARD_PLUGIN, 'query_log', {
          search,
          filter,
          olderThan: pageParam,
          limit: PAGE_SIZE,
        }),
      ).page;
      pluginLog.debug('plugin_query.fetched', {
        pluginId: ADGUARD_PLUGIN,
        query: 'query_log',
        filter,
        searchLength: search.length,
        firstPage: pageParam === FIRST_PAGE,
        entries: page.entries.length,
        hasOlder: page.olderThan !== null,
      });
      return page;
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.olderThan,
    staleTime: 0,
  };
}

export function hasOlderLookups(hasNextPage: boolean, loadedPages: number): boolean {
  return hasNextPage && loadedPages < LOADED_PAGES;
}

export function useQueryLog(search: string, filter: QueryLogFilter): QueryLogView {
  const log = useScreenInfiniteQuery(queryLogOptions(search, filter));
  return {
    entries: log.data?.pages.flatMap((page) => page.entries) ?? [],
    loading: log.isPending || log.isFetchingNextPage,
    failed: log.isError,
    more: hasOlderLookups(log.hasNextPage, log.data?.pages.length ?? 0),
    loadOlder: (): void => {
      if (!log.isFetchingNextPage) {
        background(log.fetchNextPage(), 'next_page.fetch_failed');
      }
    },
    reload: (): void => {
      background(log.refetch(), 'log.refetch_failed');
    },
  };
}
