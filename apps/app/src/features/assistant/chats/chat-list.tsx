import type { ReactElement, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useIsFocused, useLocalSearchParams, router } from 'expo-router';
import { Ambient } from '../../../components/ambient';
import { Banner } from '../../../components/banner';
import { KeyboardList } from '../../../components/keyboard-list';
import { SearchField } from '../../../components/search-field';
import { useAreaStatus } from '../data/area-status';
import type { AreaStatus } from '../model/area-status';
import type { ChatEntry } from './chat-entry';
import { ChatRow } from './chat-row';
import { FilterBar } from './filter-bar';
import { GroupHeading } from './group-heading';
import { HitRow } from './hit-row';
import { ListContent } from './list-groups';
import { ListHeader, type ListHeaderKind } from './list-header';
import { filterOfParam, type ChatFilter, type FilterCounts } from './list-filters';
import { keyboardItemsOf, needingCount, runningCount, type ListItem } from './list-items';
import { useListModel, type ListModel } from './use-list-model';

export interface ChatListProps {
  readonly kind: ListHeaderKind;
  readonly selected: string | null;
  readonly focusSearch?: boolean;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onNewChat: () => void;
}

const NO_COMPLETED: readonly ChatEntry[] = [];

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
    <View className="px-gutter pb-2">
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
  inputRef,
  focusSearch,
  onQuery,
  onFilter,
}: {
  readonly query: string;
  readonly filter: ChatFilter;
  readonly counts: FilterCounts;
  readonly inputRef: RefObject<TextInput | null>;
  readonly focusSearch: boolean;
  readonly onQuery: (query: string) => void;
  readonly onFilter: (filter: ChatFilter) => void;
}): ReactNode {
  return (
    <View className="gap-1 pb-1">
      <View className="px-gutter">
        <SearchField
          value={query}
          inputRef={inputRef}
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

function useCollapsedAgents(): {
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (chatId: string) => void;
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((chatId: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }, []);
  return { collapsed, toggle };
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
  readonly completedOpen: boolean;
  readonly toggleCompleted: () => void;
  readonly searchInput: RefObject<TextInput | null>;
  readonly clearSearch: () => void;
  readonly setQuery: (query: string) => void;
  readonly setFilter: (filter: ChatFilter) => void;
}

function useListKeys(
  sections: ListModel['sections'],
  completed: readonly ChatEntry[],
  onOpen: ChatListProps['onOpen'],
): { readonly keys: ListView['keys']; readonly activate: ListView['activate'] } {
  const items = useMemo(() => keyboardItemsOf(sections, completed), [sections, completed]);
  const keys = useMemo(() => items.map((item) => ({ id: item.key })), [items]);
  const activate = useCallback(
    (key: string): void => {
      const item = items.find((candidate) => candidate.key === key);
      if (item === undefined) {
        return;
      }
      if (item.type === 'hit') {
        onOpen(item.target.chatId, item.target.messageId ?? undefined);
      } else {
        onOpen(item.entry.id);
      }
    },
    [items, onOpen],
  );
  return { keys, activate };
}

function useCompletedDisclosure(
  query: string,
): Pick<ListView, 'completedOpen' | 'toggleCompleted'> {
  const [open, setOpen] = useState(false);
  const [hiddenQuery, setHiddenQuery] = useState<string | null>(null);
  const needle = query.trim();
  const completedOpen = needle === '' ? open : hiddenQuery !== needle;
  return {
    completedOpen,
    toggleCompleted: (): void => {
      if (needle === '') setOpen((current) => !current);
      else setHiddenQuery(completedOpen ? needle : null);
    },
  };
}

function useListView(props: ChatListProps): ListView {
  const [query, setQuery] = useState('');
  const searchInput = useRef<TextInput>(null);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const agents = useCollapsedAgents();
  const completed = useCompletedDisclosure(query);
  const model = useListModel(filter, query, agents.collapsed);
  const area = useAreaStatus();
  const { selected, onOpen, onDeleted } = props;
  useFilterParam(setFilter);
  const context = useMemo<RowContext>(
    () => ({
      selected,
      timeZone: model.timeZone,
      query,
      onOpen,
      onToggleAgents: agents.toggle,
      onDeleted,
    }),
    [selected, model.timeZone, query, onOpen, agents.toggle, onDeleted],
  );
  const render = useCallback((item: ListItem) => renderRow(item, context), [context]);
  const { keys, activate } = useListKeys(
    model.sections,
    completed.completedOpen ? model.completedHelpers : NO_COMPLETED,
    onOpen,
  );
  return {
    query,
    filter,
    model,
    area,
    loading: model.loading || area.kind === 'loading',
    keys,
    render,
    activate,
    ...completed,
    searchInput,
    clearSearch: (): void => {
      setQuery('');
    },
    setQuery,
    setFilter,
  };
}

export function ChatList(props: ChatListProps): ReactNode {
  const view = useListView(props);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  const { model } = view;
  const bare = !view.loading && model.total === 0 && view.filter === 'all' && view.query === '';
  return (
    <View className="relative min-h-0 flex-1 bg-bg">
      <Ambient height={headerHeight + controlsHeight} />
      <View
        onLayout={(event) => {
          setHeaderHeight(event.nativeEvent.layout.height);
        }}
      >
        <ListHeader kind={props.kind} />
        {view.area.kind === 'offline-cached' ? <OfflineBanner /> : null}
      </View>
      <KeyboardList
        items={view.keys}
        onActivate={view.activate}
        searchInput={view.searchInput}
        label="Chats"
        className="min-h-0 flex-1"
        {...(view.query === '' ? {} : { onEscape: view.clearSearch })}
      >
        <View
          onLayout={(event) => {
            setControlsHeight(event.nativeEvent.layout.height);
          }}
        >
          {bare ? null : (
            <Controls
              query={view.query}
              filter={view.filter}
              counts={model.counts}
              inputRef={view.searchInput}
              focusSearch={props.focusSearch === true}
              onQuery={view.setQuery}
              onFilter={view.setFilter}
            />
          )}
          <GroupHeading count={model.chatCount} onNewChat={props.onNewChat} />
        </View>
        <ListContent view={view} list={props} />
      </KeyboardList>
    </View>
  );
}
