import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { VirtualList } from '../../../components/virtual-list';
import type { AreaStatus } from '../model/area-status';
import type { ChatFilter } from './list-filters';
import { sameListItem, type ListItem } from './list-items';
import {
  EmptyList,
  HitsSkeleton,
  ListFailure,
  ListSkeleton,
  MoreSkeleton,
  OfflineEmptyList,
} from './list-states';
import { CompletedHelpers } from './subagent-rows';
import type { ListModel } from './use-list-model';

export interface ListGroupsProps {
  readonly selected: string | null;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onNewChat: () => void;
}

export interface ListGroupsView {
  readonly query: string;
  readonly filter: ChatFilter;
  readonly model: ListModel;
  readonly area: AreaStatus;
  readonly render: (item: ListItem) => ReactElement;
  readonly completedOpen: boolean;
  readonly toggleCompleted: () => void;
  readonly setQuery: (query: string) => void;
  readonly setFilter: (filter: ChatFilter) => void;
}

function ListEmpty({
  model,
  area,
  filter,
  query,
  onFilter,
  onQuery,
  onNewChat,
}: {
  readonly model: ListModel;
  readonly area: AreaStatus;
  readonly filter: ChatFilter;
  readonly query: string;
  readonly onFilter: (filter: ChatFilter) => void;
  readonly onQuery: (query: string) => void;
  readonly onNewChat: () => void;
}): ReactElement {
  if (area.kind === 'offline-empty') {
    return <OfflineEmptyList />;
  }
  if (area.kind === 'loading' || model.loading) {
    return <ListSkeleton />;
  }
  if (model.failed) {
    return <ListFailure onRetry={model.retry} />;
  }
  if (model.searching) {
    return <HitsSkeleton />;
  }
  return (
    <EmptyList
      filter={filter}
      query={query}
      offline={area.kind === 'offline-cached'}
      onShowAll={() => {
        onFilter('all');
      }}
      onClearSearch={() => {
        onQuery('');
      }}
      onNewChat={onNewChat}
    />
  );
}

function ListFooter({
  view,
  list,
}: {
  readonly view: ListGroupsView;
  readonly list: ListGroupsProps;
}): ReactElement {
  const { model } = view;
  return (
    <>
      {model.failed && model.total > 0 ? <ListFailure onRetry={model.retry} /> : null}
      {model.loadingMore ? <MoreSkeleton /> : null}
      <CompletedHelpers
        entries={model.completedHelpers}
        open={view.completedOpen}
        onToggle={view.toggleCompleted}
        selected={list.selected}
        timeZone={model.timeZone}
        onOpen={list.onOpen}
        onDeleted={list.onDeleted}
      />
    </>
  );
}

export function ListContent({
  view,
  list,
}: {
  readonly view: ListGroupsView;
  readonly list: ListGroupsProps;
}): ReactNode {
  const { model } = view;
  return (
    <View className="min-h-0 flex-1">
      <VirtualList
        sections={model.sections}
        keyOf={(item) => item.key}
        renderItem={view.render}
        sameItem={sameListItem}
        onEndReached={model.loadMore}
        empty={
          model.completedHelpers.length > 0 ? (
            <></>
          ) : (
            <ListEmpty
              model={model}
              area={view.area}
              filter={view.filter}
              query={view.query}
              onFilter={view.setFilter}
              onQuery={view.setQuery}
              onNewChat={list.onNewChat}
            />
          )
        }
        footer={<ListFooter view={view} list={list} />}
      />
    </View>
  );
}
