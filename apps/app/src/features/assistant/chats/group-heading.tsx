import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { resetDraftEngine } from '../data/draft-engine';
export function GroupHeading({
  count,
  onNewChat,
}: {
  readonly count: number;
  readonly onNewChat: () => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2 pl-gutter pr-2">
      <Text variant="title-3" accessibilityRole="header" className="min-w-0 flex-1">
        Chats
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {count}
      </Text>
      <IconButton
        icon="plus"
        label="New chat"
        onPress={() => {
          resetDraftEngine();
          onNewChat();
        }}
      />
    </View>
  );
}
