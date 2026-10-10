import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import type { MessageItem } from '../data/thread';
import type { RunPosition } from '../model/speaker';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { BarTime, BubbleContent, MessagePreview, RunHeader } from './message-parts';
import { SpeakerAvatar } from './speaker-avatar';

const TAIL: Readonly<Record<RunPosition, string>> = {
  only: '',
  first: 'rounded-bl-sm',
  middle: 'rounded-l-sm',
  last: 'rounded-tl-sm',
};

function PersonBubble({
  item,
  actions,
}: {
  readonly item: MessageItem;
  readonly actions: ReturnType<typeof useMessageActions>;
}): ReactNode {
  return (
    <View
      className={cn(
        'max-w-full rounded-xl border-hairline border-outline-variant bg-surface-1 px-4 py-2.5',
        TAIL[item.position],
      )}
    >
      <BubbleContent item={item} actions={actions} fades={['surface-1']} />
    </View>
  );
}

export function PersonMessage({ item }: { readonly item: MessageItem }): ReactNode {
  const actions = useMessageActions(item);
  const { speaker, position } = item;
  const startOfRun = position === 'first' || position === 'only';
  const endOfRun = position === 'last' || position === 'only';
  return (
    <MessageFrame
      actions={actions}
      preview={
        <MessagePreview
          item={item}
          className="border-hairline border-outline-variant bg-surface-1"
        />
      }
      align="start"
      bar={<BarTime item={item} />}
      swipeable
      reserve={endOfRun}
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="flex-row items-end gap-2 pr-12 medium:pr-24">
        <View className="w-7">{endOfRun ? <SpeakerAvatar name={speaker.name} /> : null}</View>
        <View className="min-w-0 flex-1 items-start">
          {startOfRun ? <RunHeader item={item} ai={false} inset /> : null}
          <PersonBubble item={item} actions={actions} />
        </View>
      </View>
    </MessageFrame>
  );
}
