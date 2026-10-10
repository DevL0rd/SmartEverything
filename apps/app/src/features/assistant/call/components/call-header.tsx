import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import { Text } from '../../../../components/text';
import { useAssistantName } from '../../data/assistant-data';
import { useAiChat } from '../../data/chat-store';
import { callActive, type CallView } from '../call-state';

export interface CallHeaderProps {
  readonly call: CallView;
  readonly onMinimise: () => void;
}

export function CallHeader({ call, onMinimise }: CallHeaderProps): ReactNode {
  const name = useAssistantName();
  const chat = useAiChat(call.chatId);
  const title = chat === null ? name : `${name} · ${chat.title}`;
  return (
    <View className="h-app-bar flex-row items-center gap-1 px-2">
      <View className="size-touch-min">
        {callActive(call) ? (
          <IconButton
            icon="chevronDown"
            label="Keep talking in the background"
            onPress={onMinimise}
          />
        ) : null}
      </View>
      <Text variant="label" tone="variant" align="center" numberOfLines={1} className="flex-1">
        {title}
      </Text>
      <View className="size-touch-min" />
    </View>
  );
}
