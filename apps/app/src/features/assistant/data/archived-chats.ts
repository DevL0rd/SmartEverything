import { useMemo } from 'react';
import { type InfiniteData } from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import type { AiChatRow } from '@smarteverything/domain';
import { listAiChats } from '../../../api/ai';
import { ARCHIVED_CHATS_KEY } from '../../../queries/keys';
import { entryOf } from '../chats/entries';
import type { ChatEntry } from '../chats/chat-entry';
import { useChatEntrySources } from './chat-store';
import { background } from '@smarteverything/logging';

export const ARCHIVED_PAGE_SIZE = 20;

export interface ArchivedChats {
  readonly entries: readonly ChatEntry[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

export function nextArchivedCursor(page: readonly Pick<AiChatRow, 'id'>[]): string | undefined {
  return page.length < ARCHIVED_PAGE_SIZE ? undefined : page.at(-1)?.id;
}

export function useArchivedChats(enabled: boolean): ArchivedChats {
  const query = useScreenInfiniteQuery<
    AiChatRow[],
    Error,
    InfiniteData<AiChatRow[]>,
    readonly string[],
    string | undefined
  >({
    queryKey: ARCHIVED_CHATS_KEY,
    queryFn: ({ pageParam }) =>
      listAiChats({
        archived: true,
        limit: ARCHIVED_PAGE_SIZE,
        ...(pageParam === undefined ? {} : { before: pageParam }),
      }),
    initialPageParam: undefined,
    getNextPageParam: nextArchivedCursor,
    enabled,
  });
  const { previews, working, plugins } = useChatEntrySources();
  const entries = useMemo(
    () =>
      (query.data?.pages ?? []).flat().map((chat) => entryOf(chat, { previews, working, plugins })),
    [query.data, previews, working, plugins],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  return {
    entries,
    loading: enabled && query.isPending,
    failed: query.isError,
    loadingMore: isFetchingNextPage,
    loadMore: (): void => {
      if (hasNextPage && !isFetchingNextPage) {
        background(fetchNextPage(), 'next_page.fetch_failed');
      }
    },
    retry: (): void => {
      background(
        entries.length > 0 ? fetchNextPage() : query.refetch(),
        'archived_chats.background_failed',
      );
    },
  };
}
