import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useMotion } from '../../../design/motion';
import { PerfProbe } from '../../../perf/probe-kit';
import { useLiveTurn } from '../data/chat-store';
import type { MessageItem } from '../data/thread';
import { finalView, streamView, type StreamView } from '../model/stream-view';
import type { MessageActions } from './message-actions';
import { Markdown } from './markdown/markdown';
import { messageLabel, useTimeZone } from './message-parts';
import { StreamCaret } from './stream-caret';
import { TypingDots } from './typing-dots';

const FLUSH_MS = 80;

interface ReplyView {
  readonly text: string;
  readonly view: StreamView;
  readonly caret: boolean;
}

function useReplyView(item: MessageItem, live: boolean): ReplyView {
  const { row } = item;
  const turn = useLiveTurn(row.chat_id, FLUSH_MS, live);
  const text = live && turn.text.length >= row.text.length ? turn.text : row.text;
  const view = live ? streamView(text) : finalView(text);
  return { text, view, caret: live && turn.working && view.pending === null };
}

function Blocks({
  view,
  caret,
  selectable,
}: {
  readonly view: StreamView;
  readonly caret: boolean;
  readonly selectable: boolean;
}): ReactNode {
  return (
    <View className="gap-2.5">
      {view.settled === '' ? null : <Markdown text={view.settled} selectable={selectable} />}
      {view.tail === '' ? null : (
        <Markdown
          text={view.tail}
          selectable={selectable}
          endMark={caret ? <StreamCaret /> : null}
        />
      )}
      {view.pending === null ? null : (
        <View className="flex-row items-center gap-2">
          <Text variant="footnote" tone="variant">
            {view.pending === 'code' ? 'Writing code' : 'Building a table'}
          </Text>
          <TypingDots tone="primary" />
        </View>
      )}
    </View>
  );
}

export function StreamedText({
  item,
  actions,
  live,
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
  readonly live: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const timeZone = useTimeZone();
  const motion = useMotion();
  const { text, view, caret } = useReplyView(item, live);
  if (text === '' && !live) {
    return null;
  }
  const reading = live
    ? {}
    : {
        accessible: true,
        accessibilityLabel: messageLabel(item, timeZone),
        ...actions.accessibility,
      };
  return (
    <PerfProbe id="stream">
      <Animated.View
        {...(live && !motion.reduced ? { layout: LinearTransition.duration(150) } : {})}
        className="w-full gap-2.5"
      >
        {text === '' ? null : (
          <View {...reading}>
            <Blocks view={view} caret={caret} selectable={pointer} />
          </View>
        )}
      </Animated.View>
    </PerfProbe>
  );
}
