import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { exiting, useMotion } from '../../../design/motion';
import type { MessageItem } from '../data/thread';
import { isAssistantParticipant } from '../model/speaker';
import { CallCard } from './call-card';
import { MyMessage } from './my-message';
import { ParticipantMessage } from './participant-message';
import { SystemEvent, systemEventOf } from './system-event';
import { REPLY_SINK, ROW_EXIT } from './thread-motion';
import { ThreadMarkers } from './thread-markers';

function Row({
  item,
  hideText,
}: {
  readonly item: MessageItem;
  readonly hideText: boolean;
}): ReactNode {
  const { row, speaker } = item;
  if (row.kind === 'call') {
    return <CallCard row={row} />;
  }
  const event = systemEventOf(row);
  if (event !== null) {
    return <SystemEvent event={event} />;
  }
  switch (speaker.kind) {
    case 'me':
      return <MyMessage item={item} replied={item.replied} />;
    case 'person':
    case 'ai':
      return <ParticipantMessage item={item} hideText={hideText} />;
    case 'system':
      return <SystemEvent event={{ kind: 'note', icon: 'sparkles', text: row.text }} />;
  }
}

function Flash(): ReactNode {
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(450)}
      className="absolute -inset-x-2 inset-y-0 rounded-lg bg-primary/12"
    />
  );
}

function Exit({
  item,
  children,
}: {
  readonly item: MessageItem;
  readonly children: ReactNode;
}): ReactNode {
  const motion = useMotion();
  const sink = isAssistantParticipant(item.row) ? REPLY_SINK : ROW_EXIT;
  return <Animated.View {...exiting(motion, sink)}>{children}</Animated.View>;
}

export function MessageBubble({
  item,
  flash,
  hideText = false,
}: {
  readonly item: MessageItem;
  readonly flash: boolean;
  readonly hideText?: boolean;
}): ReactNode {
  return (
    <Exit item={item}>
      <ThreadMarkers item={item} />
      <View className="relative">
        {flash ? <Flash /> : null}
        <Row item={item} hideText={hideText} />
      </View>
    </Exit>
  );
}
