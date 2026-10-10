import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { SightMode } from '@smarteverything/domain';
import { href } from '../../../../app-shell/hrefs';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { useAssistantName } from '../../data/assistant-data';
import { useAiChat } from '../../data/chat-store';
import { callActive, type CallView } from '../call-state';
import { SightIndicator } from './sight-indicator';

export interface CallHeaderProps {
  readonly call: CallView;
  readonly mode: SightMode;
  readonly onMinimise: () => void;
  readonly onStopSight: () => void;
}

export function CallHeader({ call, mode, onMinimise, onStopSight }: CallHeaderProps): ReactNode {
  const name = useAssistantName();
  const chat = useAiChat(call.chatId);
  const label = (
    <View className="min-w-0">
      <Text variant="label" numberOfLines={1}>
        {name}
      </Text>
      {chat === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {chat.title}
        </Text>
      )}
    </View>
  );
  return (
    <View className="h-app-bar flex-row items-center gap-2 px-2">
      <View className="size-touch-min">
        {callActive(call) ? (
          <IconButton
            icon="chevronDown"
            label="Keep talking in the background"
            onPress={onMinimise}
          />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 items-start">
        {chat === null ? (
          label
        ) : (
          <Interactive
            label={`Open the chat ${chat.title}`}
            onPress={() => {
              router.push(href.assistantChat(chat.id));
            }}
            className="min-h-touch-min max-w-full justify-center rounded-md px-3"
            layerClassName="rounded-md"
          >
            {label}
          </Interactive>
        )}
      </View>
      {call.sight === null ? (
        <View className="size-touch-min" />
      ) : (
        <SightIndicator sight={call.sight} mode={mode} onStop={onStopSight} />
      )}
    </View>
  );
}
