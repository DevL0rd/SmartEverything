import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAiChats } from '../../../api/ai';
import { ARCHIVED_CHATS_KEY } from '../../../queries/keys';
import { entryOf } from '../chats/entries';
import type { ChatEntry } from '../chats/chat-entry';
import { useChatEntrySources } from './chat-store';

export interface ArchivedChats {
  readonly entries: readonly ChatEntry[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly refetch: () => Promise<unknown>;
}

export function useArchivedChats(enabled: boolean): ArchivedChats {
  const query = useQuery({
    queryKey: ARCHIVED_CHATS_KEY,
    queryFn: () => listAiChats({ archived: true }),
    enabled,
  });
  const { previews, working, plugins } = useChatEntrySources();
  const entries = useMemo(
    () => (query.data ?? []).map((chat) => entryOf(chat, { previews, working, plugins })),
    [query.data, previews, working, plugins],
  );
  return {
    entries,
    loading: enabled && query.isPending,
    failed: query.isError,
    refetch: query.refetch,
  };
}
