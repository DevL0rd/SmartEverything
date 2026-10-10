import type { ReactNode } from 'react';
import type { TalkMessageRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { playTime, relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useChannelMessages } from '../data/talk-data';
import { toggleMessage, usePlayingMessage } from './message-player';

const SHOWN = 8;

export function detailOf(message: TalkMessageRow, now: number): string {
  return joinParts([
    relative(message.started_at, now),
    playTime((message.duration_ms ?? 0) / 1000),
    message.kind === 'listen' ? 'Listen-in' : null,
  ]);
}

function MessageRow({ message }: { readonly message: TalkMessageRow }): ReactNode {
  const now = useMinute();
  const playing = usePlayingMessage() === message.id;
  const saved = message.storage_path !== null;
  return (
    <ListRow
      title={message.speaker_label}
      subtitle={detailOf(message, now)}
      icon={message.speaker_kind === 'camera' ? 'camera' : 'user'}
      trailing={
        saved ? (
          <IconButton
            icon={playing ? 'square' : 'play'}
            label={playing ? 'Stop' : `Play ${message.speaker_label}’s message`}
            onPress={() => {
              toggleMessage(message.id);
            }}
          />
        ) : null
      }
    />
  );
}

export function MessageList({
  channelId,
  limit = SHOWN,
}: {
  readonly channelId: string;
  readonly limit?: number;
}): ReactNode {
  const messages = useChannelMessages(channelId).slice(0, limit);
  if (messages.length === 0) {
    return null;
  }
  return (
    <List title="Recent" inset>
      {messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
    </List>
  );
}
