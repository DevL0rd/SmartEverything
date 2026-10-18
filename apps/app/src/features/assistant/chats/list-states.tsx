import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { emptyTitleOf, type ChatFilter } from './list-filters';

const SKELETON_ROWS = 6;

const HIT_SKELETON_ROWS = 3;

function SkeletonRow(): ReactNode {
  return (
    <View className="h-16 flex-row items-center gap-3">
      <Skeleton shape="circle" />
      <View className="flex-1 gap-2">
        <Skeleton shape="text" className="w-2/5" />
        <Skeleton shape="text" className="w-4/5" />
      </View>
    </View>
  );
}

export function ListSkeleton(): ReactNode {
  return (
    <View accessibilityLabel="Loading chats" className="px-gutter pt-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

export function MoreSkeleton(): ReactNode {
  return (
    <View accessibilityLabel="Loading more chats" className="px-gutter">
      <SkeletonRow />
    </View>
  );
}

export function HitsSkeleton(): ReactNode {
  return (
    <View accessibilityLabel="Searching messages" className="pt-2">
      <Text variant="footnote" tone="variant" className="pb-1 pt-2">
        In messages
      </Text>
      {Array.from({ length: HIT_SKELETON_ROWS }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

export interface EmptyListProps {
  readonly filter: ChatFilter;
  readonly query: string;
  readonly offline: boolean;
  readonly onShowAll: () => void;
  readonly onClearSearch: () => void;
  readonly onNewChat: () => void;
}

export function EmptyList({
  filter,
  query,
  offline,
  onShowAll,
  onClearSearch,
  onNewChat,
}: EmptyListProps): ReactNode {
  const text = query.trim();
  if (text !== '') {
    return (
      <EmptyState
        icon="search"
        title={`No chats match “${text}”`}
        body={
          offline
            ? 'Message search needs a connection to your hub.'
            : 'Try a different word, or search the messages inside chats.'
        }
        action={<Button label="Clear search" variant="outlined" onPress={onClearSearch} />}
      />
    );
  }
  if (filter !== 'all') {
    return (
      <EmptyState
        icon="messageCircle"
        title={emptyTitleOf(filter)}
        body="Chats that match this filter show up here."
        action={<Button label="Show all chats" variant="outlined" onPress={onShowAll} />}
      />
    );
  }
  return (
    <EmptyState
      icon="messageCircle"
      title="No chats yet"
      body="Start a chat to ask about your home or work on a computer."
      action={<Button label="New chat" onPress={onNewChat} />}
    />
  );
}

export function OfflineEmptyList(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="Can’t reach your hub"
      body="Your saved chats aren’t on this device yet. Check your connection."
      action={
        <Button label="Server settings" variant="outlined" href={href.settings.page('server')} />
      }
    />
  );
}

export function ListFailure({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <View className="px-gutter pt-4">
      <Banner
        tone="critical"
        title="Couldn’t load archived chats"
        body="Check your connection and try again."
        wrapBody
        action={{ label: 'Try again', onPress: onRetry }}
      />
    </View>
  );
}
