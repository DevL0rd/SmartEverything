import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIsEditing } from '../data/editing';
import type { MessageItem } from '../data/thread';
import { isEmojiOnly } from '../model/message-text';
import { viaLabelOf, type RunPosition } from '../model/speaker';
import { EditBubble } from './edit-bubble';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { MyMeta } from './message-meta';
import { deliveryOf } from '../model/delivery';
import { BarTime, BubbleContent, MessagePreview, messageLabel, useTimeZone } from './message-parts';
import { TurnNotice } from './turn-notice';

const TAIL: Readonly<Record<RunPosition, string>> = {
  only: '',
  first: 'rounded-br-sm',
  middle: 'rounded-r-sm',
  last: 'rounded-tr-sm',
};

function ownBubble(item: MessageItem, shown: boolean): string {
  return cn(
    'max-w-4/5 gap-2 rounded-xl bg-primary-container px-4 py-2.5',
    TAIL[item.position],
    item.waiting && 'opacity-70',
    shown && 'border border-critical/55',
  );
}

function Bubble({
  item,
  actions,
  failedShown,
}: {
  readonly item: MessageItem;
  readonly actions: ReturnType<typeof useMessageActions>;
  readonly failedShown: boolean;
}): ReactNode {
  const timeZone = useTimeZone();
  const { row } = item;
  if (row.attachments.length === 0 && isEmojiOnly(row.text)) {
    return (
      <Text variant="large-title" accessibilityLabel={messageLabel(item, timeZone)}>
        {row.text.trim()}
      </Text>
    );
  }
  return (
    <View className={ownBubble(item, failedShown)}>
      <BubbleContent item={item} actions={actions} fades={['bg', 'primary-container']} />
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
  const { row, position, multiParty, waiting } = item;
  const failed = row.state === 'failed' && !replied;
  const endOfRun = position === 'last' || position === 'only';
  const mark = deliveryOf(row, waiting);
  return (
    <MessageFrame
      actions={actions}
      preview={<MessagePreview item={item} className="bg-primary-container" />}
      align="end"
      bar={endOfRun ? null : <BarTime item={item} />}
      swipeable
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="items-end">
        {editing ? (
          <EditBubble row={row} hasReply={replied} />
        ) : (
          <Bubble item={item} actions={actions} failedShown={failed} />
        )}
        {endOfRun && !editing ? (
          <MyMeta row={row} mark={mark} via={multiParty ? viaLabelOf(row) : null} />
        ) : null}
        {failed && !editing ? (
          <View className="mt-2 w-full max-w-dialog self-end">
            <TurnNotice row={row} subject="request" />
          </View>
        ) : null}
      </View>
    </MessageFrame>
  );
}
