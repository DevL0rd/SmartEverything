import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { detailOf } from '../components/message-list';
import { toggleMessage, usePlayingMessage } from '../components/message-player';
import { useChannelMessages } from '../data/talk-data';

export function RecentMessages({
  channelId,
  limit,
  editing,
}: {
  readonly channelId: string;
  readonly limit: number;
  readonly editing: boolean;
}): ReactNode {
  const messages = useChannelMessages(channelId).slice(0, limit);
  const playing = usePlayingMessage();
  const now = useMinute();
  if (messages.length === 0) {
    return null;
  }
  return (
    <View className="gap-1 rounded-md bg-surface-2 p-2">
      {messages.map((message) => (
        <View key={message.id} className="min-h-touch-min flex-row items-center gap-2 pl-2">
          <View className="min-w-0 flex-1">
            <Text variant="callout" numberOfLines={1}>
              {message.speaker_label}
            </Text>
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {detailOf(message, now)}
            </Text>
          </View>
          {message.storage_path === null ? null : (
            <IconButton
              icon={playing === message.id ? 'square' : 'play'}
              label={playing === message.id ? 'Stop' : `Play ${message.speaker_label}’s message`}
              disabled={editing}
              onPress={() => {
                toggleMessage(message.id);
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
