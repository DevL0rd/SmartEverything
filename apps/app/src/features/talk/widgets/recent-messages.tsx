import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TalkMessageRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { playTime, relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { toggleMessage, usePlayingMessage } from '../components/message-player';
import { useChannelMessages } from '../data/talk-data';
import { historyRows } from './layout';

function Details({
  message,
  now,
}: {
  readonly message: TalkMessageRow;
  readonly now: number;
}): ReactNode {
  const age = relative(message.started_at, now);
  const duration = playTime((message.duration_ms ?? 0) / 1000);
  const kind = message.kind === 'listen' ? 'Listen-in' : null;
  return (
    <View
      accessible
      accessibilityLabel={joinParts([message.speaker_label, age, duration, kind])}
      className="min-w-0 flex-1"
    >
      <Text variant="callout" numberOfLines={1}>
        {message.speaker_label}
      </Text>
      <View className="flex-row items-center">
        <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
          {age}
        </Text>
        <Text variant="caption" tone="variant" className="shrink-0">
          {` · ${duration}`}
        </Text>
        {kind === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {` · ${kind}`}
          </Text>
        )}
      </View>
    </View>
  );
}

export function RecentMessages({
  channelId,
  limit,
  editing,
  inline,
}: {
  readonly channelId: string;
  readonly limit: number;
  readonly editing: boolean;
  readonly inline: boolean;
}): ReactNode {
  const messages = historyRows(useChannelMessages(channelId), limit, inline);
  const playing = usePlayingMessage();
  const now = useMinute();
  if (messages.length === 0) {
    return null;
  }
  return (
    <View className={cn('gap-1 rounded-md bg-surface-2 px-2 py-1', inline && 'min-w-0 flex-1')}>
      {messages.map((message) => (
        <View key={message.id} className="min-h-touch-min flex-row items-center gap-2 pl-2">
          <Details message={message} now={now} />
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
