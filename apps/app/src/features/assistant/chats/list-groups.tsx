import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import type { AreaStatus } from '../model/area-status';
import { DesktopHistoryFailed, DesktopHistorySwitch } from '../../computers';
import { GroupHeading } from './group-heading';
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
import { InactiveAgents } from './subagent-rows';
import type { ListGroup, ListModel } from './use-list-model';

const MAIN_KEY = 'chats';

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
  readonly toggleAgents: (chatId: string) => void;
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
      <InactiveAgents
        agents={model.orphans}
        selected={list.selected}
        timeZone={model.timeZone}
        onOpen={list.onOpen}
        onToggleAgents={view.toggleAgents}
        onDeleted={list.onDeleted}
      />
    </>
  );
}

function GroupList({
  view,
  list,
  group,
  main,
}: {
  readonly view: ListGroupsView;
  readonly list: ListGroupsProps;
  readonly group: ListGroup;
  readonly main: boolean;
}): ReactNode {
  const { model } = view;
  return (
    <VirtualList
      sections={group.sections}
      keyOf={(item) => item.key}
      renderItem={view.render}
      sameItem={sameListItem}
      onEndReached={model.loadMore}
      {...(main
        ? {
            empty: (
              <ListEmpty
                model={model}
                area={view.area}
                filter={view.filter}
                query={view.query}
                onFilter={view.setFilter}
                onQuery={view.setQuery}
                onNewChat={list.onNewChat}
              />
            ),
            footer: <ListFooter view={view} list={list} />,
          }
        : {})}
    />
  );
}

function collapsed(group: ListGroup, runtimeContent: boolean): boolean {
  return group.sections.length === 0 && (group.key !== MAIN_KEY || runtimeContent);
}

export function ListContent({
  view,
  list,
}: {
  readonly view: ListGroupsView;
  readonly list: ListGroupsProps;
}): ReactNode {
  const { groups } = view.model;
  const runtimeContent = groups.some(
    (group) => group.key !== MAIN_KEY && group.sections.length > 0,
  );
  return (
    <>
      {groups.map((group, at) => (
        <View key={group.key} className={collapsed(group, runtimeContent) ? '' : 'min-h-0 flex-1'}>
          <GroupHeading group={group} first={at === 0} onNewChat={list.onNewChat} />
          {group.historyOff.map((off) => (
            <DesktopHistorySwitch key={off.deviceId} deviceId={off.deviceId} name={off.name} />
          ))}
          {group.historyFailed.map((failure) => (
            <DesktopHistoryFailed
              key={failure.deviceId}
              deviceId={failure.deviceId}
              name={failure.name}
              reason={failure.reason}
            />
          ))}
          {group.emptyText !== null && group.sections.length === 0 ? (
            <Text variant="footnote" tone="variant" className="px-gutter py-2">
              {group.emptyText}
            </Text>
          ) : collapsed(group, runtimeContent) ? null : (
            <GroupList view={view} list={list} group={group} main={group.key === MAIN_KEY} />
          )}
        </View>
      ))}
    </>
  );
}
