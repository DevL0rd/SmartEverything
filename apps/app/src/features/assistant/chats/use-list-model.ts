import { useMemo } from 'react';
import type { AiChatHit, ComputerAiRuntime } from '@smarteverything/domain';
import { usePendingKeys } from '../../../components/deferred-action';
import type { VirtualSection } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useIsOwner, useLoaded } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { useArchivedChats } from '../data/archived-chats';
import { useMessageHits } from '../data/chat-search';
import { useChatEntries } from '../data/chat-store';
import { useDesktopListing, type DesktopListing } from '../data/desktop-listing';
import { useEngineCatalogue } from '../provider/provider-data';
import { orphanAgentsOf, sectionsOf, type ChatEntry } from './chat-entry';
import { matchesChat } from './entries';
import { partitionChats } from './chat-groups';
import { availableRuntimes } from './runtime-start';
import type { HistoryFailure, HistoryOff } from './desktop-sessions';
import { itemsOf, type ListItem } from './list-items';
import {
  applyFilter,
  countsOf,
  withoutPending,
  type ChatFilter,
  type FilterCounts,
} from './list-filters';

export interface ListGroup {
  readonly key: string;
  readonly runtime: ComputerAiRuntime | null;
  readonly title: string;
  readonly emptyText: string | null;
  readonly historyOff: readonly HistoryOff[];
  readonly historyFailed: readonly HistoryFailure[];
  readonly sections: readonly VirtualSection<ListItem>[];
}

export interface ListModel {
  readonly groups: readonly ListGroup[];
  readonly orphans: readonly ChatEntry[];
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

interface GroupContext {
  readonly now: number;
  readonly timeZone: string | null;
  readonly hits: readonly AiChatHit[];
  readonly expanded: ReadonlySet<string>;
  readonly entries: ReadonlyMap<string, ChatEntry>;
  readonly available: ReadonlySet<ComputerAiRuntime>;
  readonly desktop: Pick<DesktopListing, 'off' | 'failed'>;
}

function groupsOf(
  matched: readonly ChatEntry[],
  base: readonly ChatEntry[],
  narrowed: boolean,
  context: GroupContext,
): readonly ListGroup[] {
  const { now, timeZone, hits, expanded, entries, available, desktop } = context;
  return partitionChats(matched, base, available).map((group, at) => ({
    key: group.key,
    runtime: group.key === 'chats' ? null : group.key,
    title: group.title,
    emptyText: group.entries.length === 0 ? group.emptyText : null,
    historyOff: group.key === 'claude' ? desktop.off : NO_HISTORY_OFF,
    historyFailed: group.key === 'claude' ? desktop.failed : NO_HISTORY_FAILED,
    sections: itemsOf(
      sectionsOf(group.entries, base, { now, timeZone, narrowed }),
      at === 0 ? hits : [],
      expanded,
      entries,
    ),
  }));
}

const NO_HISTORY_OFF: readonly HistoryOff[] = [];
const NO_HISTORY_FAILED: readonly HistoryFailure[] = [];

const NO_RUNTIMES: ReadonlySet<ComputerAiRuntime> = new Set();

function useAvailableRuntimes(browsing: boolean): ReadonlySet<ComputerAiRuntime> {
  const owner = useIsOwner();
  const catalogue = useEngineCatalogue();
  const computers = catalogue.data?.computers;
  return useMemo(
    () =>
      !browsing || !owner || computers === undefined ? NO_RUNTIMES : availableRuntimes(computers),
    [browsing, owner, computers],
  );
}

function useBaseEntries(
  filter: ChatFilter,
  live: readonly ChatEntry[],
  archived: readonly ChatEntry[],
  desktop: readonly ChatEntry[],
): readonly ChatEntry[] {
  const pending = usePendingKeys();
  return useMemo(
    () => withoutPending(filter === 'archived' ? archived : [...live, ...desktop], pending),
    [filter, archived, live, desktop, pending],
  );
}

function useListTotals(
  filter: ChatFilter,
  query: string,
  base: readonly ChatEntry[],
  live: readonly ChatEntry[],
): { readonly orphans: readonly ChatEntry[]; readonly counts: FilterCounts } {
  const pending = usePendingKeys();
  const orphans = useMemo(
    () => (filter === 'all' && query.trim() === '' ? orphanAgentsOf(base) : []),
    [base, filter, query],
  );
  const counts = useMemo(() => countsOf(withoutPending(live, pending)), [live, pending]);
  return { orphans, counts };
}

export function useListModel(
  filter: ChatFilter,
  query: string,
  expanded: ReadonlySet<string>,
): ListModel {
  const live = useChatEntries();
  const archived = useArchivedChats(filter === 'archived');
  const loaded = useLoaded();
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const hits = useMessageHits(query, filter === 'archived');
  const desktop = useDesktopListing(filter, query);
  const base = useBaseEntries(filter, live, archived.entries, desktop.entries);
  const entries = useMemo(() => new Map(base.map((entry) => [entry.id, entry])), [base]);
  const available = useAvailableRuntimes(filter === 'all' && query.trim() === '');
  const matched = useMemo(() => visibleOf(base, filter, query), [base, filter, query]);
  const groups = useMemo(
    () =>
      groupsOf(matched, base, base !== matched, {
        now,
        timeZone,
        hits: hits.hits,
        expanded,
        entries,
        available,
        desktop,
      }),
    [matched, base, now, timeZone, hits.hits, expanded, entries, available, desktop],
  );
  const { orphans, counts } = useListTotals(filter, query, base, live);
  return {
    groups,
    orphans,
    counts,
    total: base.length,
    hasHits: hits.hits.length > 0,
    loading: filter === 'archived' ? archived.loading : !loaded,
    failed: filter === 'archived' && archived.failed,
    searching: hits.pending,
    loadingMore: filter === 'archived' && archived.loadingMore,
    timeZone,
    retry: archived.retry,
    loadMore: archived.loadMore,
  };
}
