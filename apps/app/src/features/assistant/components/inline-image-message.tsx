import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { speakerOf } from '../model/speaker';
import type { MessageItem } from '../data/thread';
import { MessageWidgets } from '../widgets/message-widgets';
import { Attachments } from './attachments';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { ReplyMeta } from './message-meta';

function InlineImageMessage({ item }: { readonly item: MessageItem }): ReactNode {
  const actions = useMessageActions(item);
  return (
    <MessageFrame
      actions={actions}
      align="start"
      bar={<ReplyMeta item={item} onPress={actions.openDetails} />}
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="gap-2">
        <Attachments attachments={item.row.attachments} chatId={item.row.chat_id} />
        <MessageWidgets row={item.row} />
      </View>
    </MessageFrame>
  );
}
export function renderInlineImageMessage(item: MessageItem, _flash: boolean): ReactNode {
  return <InlineImageMessage item={item} />;
}

export function inlineMessageItem(row: AssistantMessageRow): MessageItem {
  return {
    type: 'message',
    key: row.id,
    row,
    speaker: speakerOf(row),
    position: 'only',
    day: null,
    dayName: '',
    gap: null,
    divider: false,
    latestReply: false,
    group: false,
    participant: null,
    host: false,
    origin: null,
    quote: null,
    quoted: null,
    mentions: null,
    stats: null,
    waiting: false,
    replied: false,
    costPeak: null,
    segment: null,
  };
}
