import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { exiting, useMotion } from '../../../design/motion';
import type { MessageItem } from '../data/thread';
import { AiMessage } from './ai-message';
import { CallCard } from './call-card';
import { MyMessage } from './my-message';
import { PersonMessage } from './person-message';
import { SystemEvent, systemEventOf } from './system-event';
import { Rise } from './rise';
import { MESSAGE_FADE, REPLY_SINK, RISE_MS, RISE_PX, ROW_EXIT } from './thread-motion';
import { DayChip, TimeGap, UnreadDivider } from './thread-markers';

const OPENED_AT = Date.now();

const animated = new Set<string>();

function isFresh(row: AssistantMessageRow): boolean {
  if (Date.parse(row.created_at) <= OPENED_AT || animated.has(row.id)) {
    return false;
  }
  animated.add(row.id);
  return true;
}

function Row({ item }: { readonly item: MessageItem }): ReactNode {
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
      return <PersonMessage item={item} />;
    case 'ai':
      return <AiMessage item={item} />;
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

function Markers({ item }: { readonly item: MessageItem }): ReactNode {
  return (
    <>
      {item.day === null ? null : <DayChip label={item.day} />}
      {item.divider ? <UnreadDivider /> : null}
      {item.gap === null ? null : <TimeGap label={item.gap} />}
    </>
  );
}

function Entry({
  item,
  fresh,
  children,
}: {
  readonly item: MessageItem;
  readonly fresh: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const motion = useMotion();
  const { speaker, row } = item;
  if (!fresh || motion.reduced) {
    return (
      <Animated.View {...exiting(motion, speaker.kind === 'ai' ? REPLY_SINK : ROW_EXIT)}>
        {children}
      </Animated.View>
    );
  }
  if (speaker.kind === 'me' && row.origin?.source === 'app') {
    return (
      <Rise from={RISE_PX.send} duration={RISE_MS.send}>
        {children}
      </Rise>
    );
  }
  if (speaker.kind === 'ai') {
    return (
      <Rise from={RISE_PX.reply} duration={RISE_MS.reply}>
        {children}
      </Rise>
    );
  }
  return <Animated.View entering={MESSAGE_FADE}>{children}</Animated.View>;
}

export function MessageBubble({
  item,
  flash,
}: {
  readonly item: MessageItem;
  readonly flash: boolean;
}): ReactNode {
  const [fresh] = useState(() => isFresh(item.row));
  return (
    <Entry item={item} fresh={fresh}>
      <Markers item={item} />
      <View className="relative">
        {flash ? <Flash /> : null}
        <Row item={item} />
      </View>
    </Entry>
  );
}
