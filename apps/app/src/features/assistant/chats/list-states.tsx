import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { emptyTitleOf, type ChatFilter } from './list-filters';

const SKELETON_ROWS = 6;

export function ListSkeleton(): ReactNode {
  return (
    <View accessibilityLabel="Loading chats" className="gap-4 px-gutter pt-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3">
          <Skeleton shape="circle" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-2/5" />
            <Skeleton shape="text" className="w-4/5" />
          </View>
        </View>
      ))}
    </View>
  );
}

function Message({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <View className="items-center gap-2 px-gutter py-10">
      <Text variant="body-strong" align="center">
        {title}
      </Text>
      {body === undefined ? null : (
        <Text variant="callout" tone="variant" align="center">
          {body}
        </Text>
      )}
      {action === undefined ? null : <View className="pt-1">{action}</View>}
    </View>
  );
}

export interface EmptyListProps {
  readonly filter: ChatFilter;
  readonly query: string;
  readonly onShowAll: () => void;
  readonly onClearSearch: () => void;
}

export function EmptyList({ filter, query, onShowAll, onClearSearch }: EmptyListProps): ReactNode {
  const text = query.trim();
  if (text !== '') {
    return (
      <Message
        title={`Nothing matches “${text}”.`}
        action={<Button label="Clear search" variant="text" onPress={onClearSearch} />}
      />
    );
  }
  if (filter !== 'all') {
    return (
      <Message
        title={emptyTitleOf(filter)}
        action={<Button label="Show all" variant="text" onPress={onShowAll} />}
      />
    );
  }
  return (
    <Message
      title="Your chats appear here"
      body="Start with a question or a task. Each chat is remembered separately."
    />
  );
}

export function ListFailure({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <Message
      title="Couldn’t load archived chats"
      action={<Button label="Try again" variant="text" onPress={onRetry} />}
    />
  );
}
