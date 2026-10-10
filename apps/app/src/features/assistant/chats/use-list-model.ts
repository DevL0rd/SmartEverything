import { useMemo } from 'react';
import { useMinute } from '../../../store/clock';
import { useLoaded } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { useArchivedChats } from '../data/archived-chats';
import { useMessageHits } from '../data/chat-search';
import { useChatEntries } from '../data/chat-store';
import { sectionsOf, type ChatEntry } from './chat-entry';
import { matchesChat } from './entries';
import { itemsOf, stickyIndicesOf, type ListItem } from './list-items';
import { applyFilter, countsOf, type ChatFilter, type FilterCounts } from './list-filters';

export interface ListModel {
  readonly items: readonly ListItem[];
  readonly sticky: readonly number[];
  readonly counts: FilterCounts;
  readonly entries: ReadonlyMap<string, ChatEntry>;
  readonly total: number;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly searching: boolean;
  readonly timeZone: string | null;
  readonly retry: () => void;
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

export function useListModel(filter: ChatFilter, query: string): ListModel {
  const live = useChatEntries();
  const archived = useArchivedChats(filter === 'archived');
  const loaded = useLoaded();
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const hits = useMessageHits(query, filter === 'archived');
  const base = filter === 'archived' ? archived.entries : live;
  const shown = useMemo(() => {
    const sections = sectionsOf(visibleOf(base, filter, query), now, timeZone);
    const items = itemsOf(sections, hits.hits);
    return { items, sticky: stickyIndicesOf(items) };
  }, [base, filter, query, now, timeZone, hits.hits]);
  const counts = useMemo(() => countsOf(live), [live]);
  const entries = useMemo(() => new Map(base.map((entry) => [entry.id, entry])), [base]);
  return {
    ...shown,
    counts,
    entries,
    total: base.length,
    loading: filter === 'archived' ? archived.loading : !loaded,
    failed: filter === 'archived' && archived.failed,
    searching: hits.pending,
    timeZone,
    retry: (): void => {
      void archived.refetch();
    },
  };
}
