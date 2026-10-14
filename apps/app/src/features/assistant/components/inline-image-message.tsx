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
import { MessagePreview } from './message-parts';

function InlineImageMessage({ item }: { readonly item: MessageItem }): ReactNode {
  const actions = useMessageActions(item);
  return (
    <MessageFrame
      actions={actions}
      preview={<MessagePreview item={item} className="bg-surface-1" />}
      align="start"
      bar={<ReplyMeta row={item.row} onPress={actions.openDetails} />}
      swipeable
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

export function inlineImageItem(row: AssistantMessageRow): MessageItem {
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
    multiParty: false,
    waiting: false,
    replied: false,
  };
}
