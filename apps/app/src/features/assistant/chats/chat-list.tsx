import type { ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { useIsFocused, useLocalSearchParams, router } from 'expo-router';
import { Banner } from '../../../components/banner';
import { Text } from '../../../components/text';
import { SearchField } from '../../../components/search-field';
import { usePrimaryActionPlacement } from '../../../components/primary-action';
import { useMotion } from '../../../design/motion';
import { useSyncStatus } from '../../../store/selectors';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';
import { ChatRow } from './chat-row';
import { FilterBar } from './filter-bar';
import { HitRow } from './hit-row';
import { filterOfParam, type ChatFilter, type FilterCounts } from './list-filters';
import type { ListItem } from './list-items';
import { ROW_REORDER } from './list-motion';
import { EmptyList, ListFailure, ListSkeleton } from './list-states';
import { NewChatFab } from './new-chat-fab';
import { useListModel, type ListModel } from './use-list-model';

const FAB_SHRINK_AT = 24;

export interface ChatListProps {
  readonly selected: string | null;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onNewChat: () => void;
  readonly top?: ReactNode;
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
  const status = useSyncStatus().status;
  if (status !== 'interrupted' && status !== 'refused') {
    return null;
  }
  return (
    <View className="px-3 pb-2">
      <Banner tone="info" title="Offline · showing saved chats" />
    </View>
  );
}

function SectionTitle({ title }: { readonly title: string }): ReactNode {
  return (
    <View className="bg-bg px-gutter pb-1 pt-4">
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

interface RowContext {
  readonly selected: string | null;
  readonly entries: ReadonlyMap<string, ChatEntry>;
  readonly timeZone: string | null;
  readonly query: string;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
}

function renderRow(item: ListItem, context: RowContext): ReactElement {
  switch (item.type) {
    case 'header':
      return <SectionTitle title={item.title} />;
    case 'chat':
      return (
        <ChatRow
          entry={item.item.entry}
          nested={item.item.nested}
          selected={context.selected === item.item.entry.id}
          timeZone={context.timeZone}
          onOpen={context.onOpen}
          onDeleted={context.onDeleted}
        />
      );
    case 'hit':
      return (
        <HitRow
          hit={item.hit}
          source={context.entries.get(item.hit.chatId)?.source ?? APP_SOURCE}
          query={context.query}
          timeZone={context.timeZone}
          onOpen={(chatId, messageId) => {
            context.onOpen(chatId, messageId ?? undefined);
          }}
        />
      );
  }
}

function ListEmpty({
  model,
  filter,
  query,
  onFilter,
  onQuery,
}: {
  readonly model: ListModel;
  readonly filter: ChatFilter;
  readonly query: string;
  readonly onFilter: (filter: ChatFilter) => void;
  readonly onQuery: (query: string) => void;
}): ReactNode {
  if (model.loading) {
    return <ListSkeleton />;
  }
  if (model.failed) {
    return <ListFailure onRetry={model.retry} />;
  }
  return model.searching ? null : (
    <EmptyList
      filter={filter}
      query={query}
      onShowAll={() => {
        onFilter('all');
      }}
      onClearSearch={() => {
        onQuery('');
      }}
    />
  );
}

function ListBody({
  items,
  sticky,
  context,
  empty,
  onScrolled,
}: {
  readonly items: readonly ListItem[];
  readonly sticky: readonly number[];
  readonly context: RowContext;
  readonly empty: ReactElement;
  readonly onScrolled: (past: boolean) => void;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.FlatList
      data={items}
      extraData={context}
      keyExtractor={(item) => item.key}
      stickyHeaderIndices={[...sticky]}
      renderItem={({ item }) => renderRow(item, context)}
      ListEmptyComponent={empty}
      {...(motion.reduced ? {} : { itemLayoutAnimation: ROW_REORDER })}
      skipEnteringExitingAnimations
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="pb-28"
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScrolled(event.nativeEvent.contentOffset.y > FAB_SHRINK_AT);
      }}
      initialNumToRender={14}
      windowSize={7}
    />
  );
}

function ListHeader({
  top,
  query,
  filter,
  counts,
  onQuery,
  onFilter,
}: {
  readonly top: ReactNode;
  readonly query: string;
  readonly filter: ChatFilter;
  readonly counts: FilterCounts;
  readonly onQuery: (query: string) => void;
  readonly onFilter: (filter: ChatFilter) => void;
}): ReactNode {
  return (
    <View className="gap-2 pb-2">
      {top}
      <OfflineBanner />
      <View className="px-3">
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder="Search chats and messages"
          variant="field"
        />
      </View>
      <FilterBar filter={filter} counts={counts} onChange={onFilter} />
    </View>
  );
}

export function ChatList(props: ChatListProps): ReactNode {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [past, setPast] = useState(false);
  const model = useListModel(filter, query);
  const fab = usePrimaryActionPlacement() === 'fab';
  const applyParam = useCallback((next: ChatFilter): void => {
    setFilter(next);
  }, []);
  useFilterParam(applyParam);
  const context: RowContext = {
    selected: props.selected,
    entries: model.entries,
    timeZone: model.timeZone,
    query,
    onOpen: props.onOpen,
    onDeleted: props.onDeleted,
  };
  return (
    <View className="relative min-h-0 flex-1">
      <ListHeader
        top={props.top}
        query={query}
        filter={filter}
        counts={model.counts}
        onQuery={setQuery}
        onFilter={setFilter}
      />
      <ListBody
        items={model.items}
        sticky={model.sticky}
        context={context}
        empty={
          <ListEmpty
            model={model}
            filter={filter}
            query={query}
            onFilter={setFilter}
            onQuery={setQuery}
          />
        }
        onScrolled={setPast}
      />
      {fab ? <NewChatFab extended={!past} onPress={props.onNewChat} /> : null}
    </View>
  );
}
