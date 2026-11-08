import { useMemo } from 'react';
import { usePendingKeys } from '../../../components/deferred-action';
import type { VirtualSection } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useLoaded } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { useArchivedChats } from '../data/archived-chats';
import { useMessageHits } from '../data/chat-search';
import { useChatEntries } from '../data/chat-store';
import { completedHelpersOf, sectionsOf, type ChatEntry } from './chat-entry';
import { matchesChat } from './entries';
import { hiddenChatIds, visibleAppChats } from './chat-visibility';
import { itemsOf, type ListItem } from './list-items';
import {
  applyFilter,
  countsOf,
  withoutPending,
  type ChatFilter,
  type FilterCounts,
} from './list-filters';

export interface ListModel {
  readonly sections: readonly VirtualSection<ListItem>[];
  readonly chatCount: number;
  readonly completedHelpers: readonly ChatEntry[];
  readonly counts: FilterCounts;
  readonly total: number;
  readonly hasHits: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly searching: boolean;
  readonly loadingMore: boolean;
  readonly timeZone: string | null;
  readonly retry: () => void;
  readonly loadMore: () => void;
}

function visibleOf(
  base: readonly ChatEntry[],
  filter: ChatFilter,
  query: string,
): readonly ChatEntry[] {
  const needle = query.trim().toLowerCase();
  const filtered = applyFilter(base, filter);
  return needle === '' ? filtered : filtered.filter((entry) => matchesChat(entry, needle));
}

function useBaseEntries(
  filter: ChatFilter,
  live: readonly ChatEntry[],
  archived: readonly ChatEntry[],
): readonly ChatEntry[] {
  const pending = usePendingKeys();
  return useMemo(
    () => withoutPending(filter === 'archived' ? archived : live, pending),
    [filter, archived, live, pending],
  );
}

function useListCounts(live: readonly ChatEntry[]): FilterCounts {
  const pending = usePendingKeys();
  return useMemo(() => countsOf(withoutPending(live, pending)), [live, pending]);
}

export function useListModel(
  filter: ChatFilter,
  query: string,
  collapsed: ReadonlySet<string>,
): ListModel {
  const liveRows = useChatEntries();
  const live = useMemo(() => visibleAppChats(liveRows), [liveRows]);
  const archived = useArchivedChats(filter === 'archived');
  const archivedRows = useMemo(() => visibleAppChats(archived.entries), [archived.entries]);
  const loaded = useLoaded();
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const hits = useMessageHits(query, filter === 'archived');
  const base = useBaseEntries(filter, live, archivedRows);
  const matched = useMemo(() => visibleOf(base, filter, query), [base, filter, query]);
  const completedHelpers = useMemo(() => completedHelpersOf(matched), [matched]);
  const entries = useMemo(() => new Map(base.map((entry) => [entry.id, entry])), [base]);
  const knownHidden = useMemo(
    () => hiddenChatIds(liveRows, archived.entries),
    [liveRows, archived.entries],
  );
  const results = useMemo(
    () => hits.hits.filter((hit) => !knownHidden.has(hit.chatId)),
    [hits.hits, knownHidden],
  );
  const { sections, chatCount } = useMemo(() => {
    const chats = sectionsOf(matched, base, { now, timeZone, narrowed: base !== matched });
    return {
      sections: itemsOf(chats, results, collapsed, entries),
      chatCount: chats.reduce((sum, section) => sum + section.data.length, 0),
    };
  }, [base, matched, now, timeZone, results, collapsed, entries]);
  const counts = useListCounts(live);
  return {
    sections,
    chatCount,
    completedHelpers,
    counts,
    total: base.length,
    hasHits: results.length > 0,
    loading: filter === 'archived' ? archived.loading : !loaded,
    failed: filter === 'archived' && archived.failed,
    searching: hits.pending,
    loadingMore: filter === 'archived' && archived.loadingMore,
    timeZone,
    retry: archived.retry,
    loadMore: archived.loadMore,
  };
}
