import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import { Markdown } from '../components/markdown/markdown';
import { StreamCaret } from '../components/stream-caret';
import { TypingDots } from '../components/typing-dots';
import { useChatWorking, useThrottledTurnText } from '../data/chat-store';
import { streamView } from '../model/stream-view';

function Body({ text, caret }: { readonly text: string; readonly caret: boolean }): ReactNode {
  const view = streamView(text);
  return (
    <View className="gap-2.5">
      {view.settled === '' ? null : <Markdown text={view.settled} />}
      {view.tail === '' ? null : (
        <Markdown
          text={view.tail}
          endMark={caret && view.pending === null ? <StreamCaret /> : null}
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

const FLUSH_MS = 80;

export function StreamingBubble({
  chatId,
  fallback,
}: {
  readonly chatId: string;
  readonly fallback: string;
}): ReactNode {
  const streamed = useThrottledTurnText(chatId, FLUSH_MS);
  const live = useChatWorking(chatId);
  const motion = useMotion();
  const text = streamed.length < fallback.length ? fallback : streamed;
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: LinearTransition.duration(150) })}
      className="w-full gap-2.5"
    >
      {text === '' ? null : <Body text={text} caret={live} />}
    </Animated.View>
  );
}
