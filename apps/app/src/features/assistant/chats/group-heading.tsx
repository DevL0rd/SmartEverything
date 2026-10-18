import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { resetDraftEngine } from '../data/draft-engine';
import { RuntimeStartButton } from './runtime-start-button';
import type { ListGroup } from './use-list-model';

function StartButton({
  runtime,
  onNewChat,
}: {
  readonly runtime: ListGroup['runtime'];
  readonly onNewChat: () => void;
}): ReactNode {
  if (runtime !== null) return <RuntimeStartButton runtime={runtime} onNewChat={onNewChat} />;
  return (
    <IconButton
      icon="plus"
      label="New chat"
      onPress={() => {
        resetDraftEngine();
        onNewChat();
      }}
    />
  );
}

export function GroupHeading({
  group,
  first,
  onNewChat,
}: {
  readonly group: ListGroup;
  readonly first: boolean;
  readonly onNewChat: () => void;
}): ReactNode {
  const count = group.sections.reduce(
    (sum, section) => sum + section.data.filter((item) => item.type === 'chat').length,
    0,
  );
  return (
    <View
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 bg-bg pl-gutter pr-2',
        !first && 'border-t border-outline-variant',
      )}
    >
      <Text variant="title-3" accessibilityRole="header" className="min-w-0 flex-1">
        {group.title}
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {count}
      </Text>
      <StartButton runtime={group.runtime} onNewChat={onNewChat} />
    </View>
  );
}
