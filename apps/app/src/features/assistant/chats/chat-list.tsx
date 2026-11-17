import type { ReactElement, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useIsFocused, useLocalSearchParams, router } from 'expo-router';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { KeyboardList } from '../../../components/keyboard-list';
import type { PageSettingsLink } from '../../../components/page-menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { ShellTitle } from '../../../components/page-shell/shell-parts';
import { useAreaStatus } from '../data/area-status';
import { resetDraftEngine } from '../data/draft-engine';
import type { AreaStatus } from '../model/area-status';
import type { ChatEntry } from './chat-entry';
import { ChatRow } from './chat-row';
import { FilterBar } from './filter-bar';
import { HitRow } from './hit-row';
import { ListContent } from './list-groups';
import { filterOfParam, type ChatFilter } from './list-filters';
import { keyboardItemsOf, needingCount, runningCount, type ListItem } from './list-items';
import { useListModel, type ListModel } from './use-list-model';

export type ChatListKind = 'screen' | 'pane' | 'slide-over';

export interface ChatListProps {
  readonly kind: ChatListKind;
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

function listSettingsOf(kind: ChatListKind): PageSettingsLink | undefined {
  return kind === 'screen' ? mainPageSettings('assistant') : undefined;
}

function newChatAction(onNewChat: () => void): ShellAction {
  return {
    icon: 'plus',
    label: 'New chat',
    iconOnly: true,
    onPress: (): void => {
      resetDraftEngine();
      onNewChat();
    },
  };
}

function countLine(count: number): string {
  return `${String(count)} ${count === 1 ? 'chat' : 'chats'}`;
}

function searchOf(view: ListView, focus: boolean): ShellSearchConfig {
  return {
    value: view.query,
    onChange: view.setQuery,
    placeholder: 'Search chats and messages',
    inputRef: view.searchInput,
    focusOnMount: focus,
  };
}

function isBare(view: ListView): boolean {
  return !view.loading && view.model.total === 0 && view.filter === 'all' && view.query === '';
}

export function ChatList(props: ChatListProps): ReactNode {
  const view = useListView(props);
  const settings = listSettingsOf(props.kind);
  const bare = isBare(view);
  const filters = bare ? null : (
    <FilterBar filter={view.filter} counts={view.model.counts} onChange={view.setFilter} />
  );
  const pinned = props.kind === 'screen';
  return (
    <PageShell
      variant="pane"
      title="Chats"
      heading={<ShellTitle title="Chats" subtitle={countLine(view.model.chatCount)} size="bar" />}
      back={false}
      actions={[newChatAction(props.onNewChat)]}
      {...(settings === undefined ? {} : { settings })}
      {...(bare ? {} : { search: searchOf(view, props.focusSearch === true) })}
      {...(pinned && filters !== null ? { toolbar: filters } : {})}
    >
      {pinned || filters === null ? null : <View className="pt-1">{filters}</View>}
      <KeyboardList
        items={view.keys}
        onActivate={view.activate}
        searchInput={view.searchInput}
        label="Chats"
        className="min-h-0 flex-1 bg-bg"
        {...(view.query === '' ? {} : { onEscape: view.clearSearch })}
      >
        <ListContent view={view} list={props} />
      </KeyboardList>
    </PageShell>
  );
}
