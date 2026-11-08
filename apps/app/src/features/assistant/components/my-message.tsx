import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { cn } from '../../../design/cn';
import { useIsEditing } from '../data/editing';
import type { MessageItem } from '../data/thread';
import { deliveryOf } from '../model/delivery';
import { isEmojiOnly } from '../model/message-text';
import { voiceClipOf } from '../voice-message/voice-pill-transcript-state';
import { EditBubble } from './edit-bubble';
import { useMessageActions, type MessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { MyMeta } from './message-meta';
import { Attachments } from './attachments';
import {
  BubbleContent,
  OWN_PADDING,
  hasBubbleContent,
  messageLabel,
  ownBubbleClass,
  ownImagesClass,
  ownImagesOf,
  shownText,
  useTimeZone,
} from './message-parts';

export function showsAsEmoji(item: MessageItem): boolean {
  return item.quote === null && item.row.attachments.length === 0 && isEmojiOnly(shownText(item));
}

export function showsOwnMeta(item: MessageItem): boolean {
  const endOfRun = item.position === 'last' || item.position === 'only';
  const voice = voiceClipOf(item.row.attachments) !== null;
  return endOfRun || voice || deliveryOf(item.row, item.waiting) === 'failed';
}

function Bubble({
  item,
  actions,
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
}): ReactNode {
  const timeZone = useTimeZone();
  if (showsAsEmoji(item)) {
    return (
      <Text
        accessibilityLabel={messageLabel(item, timeZone)}
        className="font-sans text-figure-l text-on-surface"
      >
        {item.row.text.trim()}
      </Text>
    );
  }
  const images = ownImagesOf(item);
  const captioned = hasBubbleContent(item);
  return (
    <View className="w-full items-end gap-0.5">
      {images.length === 0 ? null : (
        <View className="max-w-17/20">
          <Attachments
            attachments={images}
            chatId={item.row.chat_id}
            imageShape={ownImagesClass(item.position, captioned)}
          />
        </View>
      )}
      {captioned ? (
        <View className={cn(ownBubbleClass(item.position, images.length > 0), OWN_PADDING)}>
          <BubbleContent item={item} actions={actions} tint="bubble" />
        </View>
      ) : null}
    </View>
  );
}

export function MyMessage({
  item,
  replied,
}: {
  readonly item: MessageItem;
  readonly replied: boolean;
}): ReactNode {
  const actions = useMessageActions(item);
  const editing = useIsEditing(item.row.id);
  return (
    <MessageFrame
      actions={actions}
      align="end"
      bar={null}
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="items-end">
        {editing ? (
          <EditBubble row={item.row} position={item.position} hasReply={replied} />
        ) : (
          <>
            <Bubble item={item} actions={actions} />
            {showsOwnMeta(item) ? <MyMeta item={item} /> : null}
          </>
        )}
      </View>
    </MessageFrame>
  );
}
