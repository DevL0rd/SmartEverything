import type { ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams, router } from 'expo-router';
import { Ambient } from '../../../components/ambient';
import { Banner } from '../../../components/banner';
import { KeyboardList } from '../../../components/keyboard-list';
import { SearchField } from '../../../components/search-field';
import { useAreaStatus } from '../data/area-status';
import type { AreaStatus } from '../model/area-status';
import type { ChatEntry } from './chat-entry';
import { useOpenDesktop } from './open-desktop';
import { ChatRow } from './chat-row';
import { FilterBar } from './filter-bar';
import { HitRow } from './hit-row';
import { ListContent } from './list-groups';
import { ListHeader, type ListHeaderKind } from './list-header';
import { filterOfParam, type ChatFilter, type FilterCounts } from './list-filters';
import { needingCount, runningCount, type ListItem } from './list-items';
import { useListModel, type ListModel } from './use-list-model';

export interface ChatListProps {
  readonly kind: ListHeaderKind;
  readonly selected: string | null;
  readonly focusSearch?: boolean;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onNewChat: () => void;
}

function useFilterParam(apply: (filter: ChatFilter) => void): void {
  const focused = useIsFocused();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  useEffect(() => {
    if (focused && filter !== undefined) {
      apply(filterOfParam(filter));
      router.setParams({ filter: undefined });
    }
  }, [focused, filter, apply]);
}

function OfflineBanner(): ReactNode {
  return (
    <View className="px-3 pb-2">
      <Banner tone="info" title="Offline · showing saved chats" />
    </View>
  );
}

interface RowContext {
  readonly selected: string | null;
  readonly timeZone: string | null;
  readonly query: string;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onToggleAgents: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onOpenDesktop: (entry: ChatEntry) => void;
  readonly busyId: string | null;
}

function renderRow(item: ListItem, context: RowContext): ReactElement {
  switch (item.type) {
    case 'chat':
    case 'agent':
      return (
        <ChatRow
          entry={item.entry}
          agent={item.type === 'agent'}
          agentCount={item.type === 'chat' ? item.agents.length : 0}
          agentsRunning={item.type === 'chat' ? runningCount(item.agents) : 0}
          agentsNeeding={item.type === 'chat' ? needingCount(item.agents) : 0}
          agentsOpen={item.type === 'chat' && item.open}
          selected={context.selected === item.entry.id}
          timeZone={context.timeZone}
          onOpen={context.onOpen}
          onToggleAgents={context.onToggleAgents}
          onDeleted={context.onDeleted}
          busy={context.busyId === item.entry.id}
          onOpenDesktop={context.onOpenDesktop}
        />
      );
    case 'hit':
      return (
        <HitRow
          itemKey={item.key}
          hit={item.hit}
          source={item.source}
          query={context.query}
          timeZone={context.timeZone}
          onOpen={() => {
            context.onOpen(item.target.chatId, item.target.messageId ?? undefined);
          }}
        />
      );
  }
}

function Controls({
  query,
  filter,
  counts,
  focusSearch,
  onQuery,
  onFilter,
}: {
  readonly query: string;
  readonly filter: ChatFilter;
  readonly counts: FilterCounts;
  readonly focusSearch: boolean;
  readonly onQuery: (query: string) => void;
  readonly onFilter: (filter: ChatFilter) => void;
}): ReactNode {
  return (
    <View className="gap-2 pb-2">
      <View className="px-3">
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder="Search chats and messages"
          variant="field"
          focusOnMount={focusSearch}
        />
      </View>
      <FilterBar filter={filter} counts={counts} onChange={onFilter} />
    </View>
  );
}

function useExpandedAgents(): {
  readonly expanded: ReadonlySet<string>;
  readonly toggle: (chatId: string) => void;
} {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((chatId: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }, []);
  return { expanded, toggle };
}

interface ListView {
  readonly query: string;
  readonly filter: ChatFilter;
  readonly model: ListModel;
  readonly area: AreaStatus;
  readonly loading: boolean;
  readonly keys: readonly { readonly id: string }[];
  readonly render: (item: ListItem) => ReactElement;
  readonly activate: (key: string) => void;
  readonly toggleAgents: (chatId: string) => void;
  readonly setQuery: (query: string) => void;
  readonly setFilter: (filter: ChatFilter) => void;
}

function useListKeys(
  groups: ListModel['groups'],
  onOpen: ChatListProps['onOpen'],
  onOpenDesktop: (entry: ChatEntry) => void,
): { readonly keys: ListView['keys']; readonly activate: ListView['activate'] } {
  const items = useMemo(
    () => groups.flatMap((group) => group.sections.flatMap((section) => section.data)),
    [groups],
  );
  const keys = useMemo(() => items.map((item) => ({ id: item.key })), [items]);
  const activate = useCallback(
    (key: string): void => {
      const item = items.find((candidate) => candidate.key === key);
      if (item === undefined) {
        return;
      }
      if (item.type === 'hit') {
        onOpen(item.target.chatId, item.target.messageId ?? undefined);
      } else if (item.entry.desktop !== undefined) {
        onOpenDesktop(item.entry);
      } else {
        onOpen(item.entry.id);
      }
    },
    [items, onOpen, onOpenDesktop],
  );
  return { keys, activate };
}

function useListView(props: ChatListProps): ListView {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const agents = useExpandedAgents();
  const model = useListModel(filter, query, agents.expanded);
  const area = useAreaStatus();
  const { selected, onOpen, onDeleted } = props;
  const { busyId, openDesktop } = useOpenDesktop(onOpen);
  useFilterParam(setFilter);
  const context = useMemo<RowContext>(
    () => ({
      selected,
      timeZone: model.timeZone,
      query,
      onOpen,
      onToggleAgents: agents.toggle,
      onDeleted,
      onOpenDesktop: openDesktop,
      busyId,
    }),
    [selected, model.timeZone, query, onOpen, agents.toggle, onDeleted, openDesktop, busyId],
  );
  const render = useCallback((item: ListItem) => renderRow(item, context), [context]);
  const { keys, activate } = useListKeys(model.groups, onOpen, openDesktop);
  return {
    query,
    filter,
    model,
    area,
    loading: model.loading || area.kind === 'loading',
    keys,
    render,
    activate,
    toggleAgents: agents.toggle,
    setQuery,
    setFilter,
  };
}

export function ChatList(props: ChatListProps): ReactNode {
  const view = useListView(props);
  const { model } = view;
  const bare = !view.loading && model.total === 0 && view.filter === 'all' && view.query === '';
  const clearSearch = (): void => {
    view.setQuery('');
  };
  return (
    <View className="relative min-h-0 flex-1">
      <Ambient />
      <ListHeader kind={props.kind} />
      {view.area.kind === 'offline-cached' ? <OfflineBanner /> : null}
      <KeyboardList
        items={view.keys}
        onActivate={view.activate}
        label="Chats"
        className="min-h-0 flex-1"
        {...(view.query === '' ? {} : { onEscape: clearSearch })}
      >
        {bare ? null : (
          <Controls
            query={view.query}
            filter={view.filter}
            counts={model.counts}
            focusSearch={props.focusSearch === true}
            onQuery={view.setQuery}
            onFilter={view.setFilter}
          />
        )}
        <ListContent view={view} list={props} />
      </KeyboardList>
    </View>
  );
}
